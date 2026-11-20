import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { invokeLambda, SITE_LAMBDAS } from '@/lib/lambda-invoke';

export async function DELETE(request: NextRequest) {
  // Admin only (see lib/admin-emails.ts).
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    console.log('=== Delete User API Route Started ===');
    
    const { username } = await request.json();
    console.log('Username to delete:', username);
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Call the Cognito-users Lambda directly (it has no public URL).
    const response = await invokeLambda(SITE_LAMBDAS.cognitoUsers, {
      method: 'POST',
      body: { action: 'deleteUser', username },
    });
    if (!response.ok) {
      console.error('Delete-user Lambda returned', response.status, response.data);
      return NextResponse.json({ error: `Lambda function returned ${response.status}` }, { status: response.status });
    }
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('=== Delete User API Route Error ===');
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
