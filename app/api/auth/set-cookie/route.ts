import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }
    
    // Set secure cookie with HttpOnly, Secure, and SameSite flags
    const cookieStore = await cookies();
    
    cookieStore.set('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set cookie error:', error);
    return NextResponse.json(
      { error: 'Failed to set cookie' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    
    cookieStore.delete('authToken');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete cookie error:', error);
    return NextResponse.json(
      { error: 'Failed to delete cookie' },
      { status: 500 }
    );
  }
}