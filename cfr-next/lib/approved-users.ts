


export interface ApprovedUserData {
  email: string;
  givenName: string;
  familyName: string;
  phoneNumber?: string;
}


// TODO: Implement addApprovedUser using DynamoDB if needed


// TODO: Implement bulkImportApprovedUsers using DynamoDB if needed


// TODO: Implement getApprovedUsers using DynamoDB if needed


// TODO: Implement removeApprovedUser using DynamoDB if needed

/**
 * Checks if the given email is in the ApprovedUsers DynamoDB table.
 * @param email The user's email address
 * @returns true if approved, false otherwise
 */
export async function checkUserApproval(email: string): Promise<boolean> {
  if (!email) return false;
  if (typeof window === 'undefined') {
    throw new Error('checkUserApproval should only be called on the client');
  }
  try {
    const res = await fetch(`/api/auth/check-approval?email=${encodeURIComponent(email)}`);
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    const data = await res.json();
    return !!data.approved;
  } catch (err) {
    console.error('Approval API check error:', err);
    return false;
  }
}