import { NextResponse } from 'next/server';
import { checkUserApproval } from '@/lib/approved-users';
import { requireAdmin } from '@/lib/admin-auth';
import { invokeLambda, SITE_LAMBDAS } from '@/lib/lambda-invoke';


// Function to call the Lambda function
async function getCognitoUsers() {
  try {
    // Call the Cognito-users Lambda directly (it has no public URL).
    const response = await invokeLambda(SITE_LAMBDAS.cognitoUsers, { method: 'POST', body: { action: 'listUsers' } });
    if (!response.ok) {
      console.error('Cognito-users Lambda returned', response.status);
      throw new Error(`Lambda function returned ${response.status}`);
    }
    const result = response.data as { users?: { userCreateDate: string; email: string; [key: string]: unknown }[] };
    
    if (!result.users) {
      console.error('No users property in Lambda response');
      throw new Error('Invalid response format from Lambda function');
    }
    
    return result.users.map((user) => ({
      ...user,
      userCreateDate: new Date(user.userCreateDate)
    }));
  } catch (error) {
    console.error('Error calling Lambda function:', error);
    throw error;
  }
}

export async function GET() {
  // Admin only (see lib/admin-emails.ts).
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    console.log('=== API Route Started ===');
    
    // Skip API calls during build time
    if (process.env.NODE_ENV === 'production' && !process.env.AWS_EXECUTION_ENV) {
      console.log('🔍 API: Skipping cognito users call during build time');
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }
    
    // Get all Cognito users
    const users = await getCognitoUsers();
    console.log('🔍 API: Successfully got users from Lambda:', users.length);
    console.log('🔍 API: User emails:', users.map((u: { email: string }) => u.email));
    
    // Check approval status for each user using the unified function
    console.log('🔍 API: Checking approval status for users...');
    
    const usersWithApproval = await Promise.all(
      users.map(async (user: { email: string }) => {
        try {
          console.log(`🔍 API: Checking approval for user: ${user.email}`);
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Approval check timeout')), 10000)
          );
          const approvalPromise = checkUserApproval(user.email);
          const isApproved = await Promise.race([approvalPromise, timeoutPromise]) as boolean;
          
          console.log(`🔍 API: User ${user.email} approval status: ${isApproved}`);
          
          // Special logging for our test user
          if (user.email === '0zhv2@mechanicspedia.com') {
            console.log(`🚨 SPECIAL: User 0zhv2@mechanicspedia.com has isApproved: ${isApproved}`);
          }
          
          return {
            ...user,
            isApproved
          };
        } catch (approvalError) {
          console.error(`🔍 API: Error checking approval for ${user.email}:`, approvalError);
          // Return user with approval false if check fails
          return {
            ...user,
            isApproved: false
          };
        }
      })
    );

    console.log('🔍 API: Returning users with approval status:', usersWithApproval.length);
    console.log('🔍 API: Final user emails:', usersWithApproval.map(u => u.email));
    
    // Add cache-busting headers to prevent caching issues
    return NextResponse.json(usersWithApproval, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('=== API Route Error ===');
    console.error('Error fetching Cognito users:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to fetch users', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
