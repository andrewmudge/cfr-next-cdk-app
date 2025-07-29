'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Phone, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/AuthContext';
import { toast } from 'sonner';
import Image from 'next/image';
import { formatPhoneInput, isValidUSPhone } from '@/lib/phone-utils';
import { validatePassword, isPasswordValid } from '@/lib/password-utils';

const AuthModal = () => {
  const { isAuthModalOpen, closeAuthModal, signIn, signUp, confirmSignUp, resetPassword, confirmResetPassword } = useAuth();
  const [authStep, setAuthStep] = useState<'signup' | 'signin' | 'verify' | 'reset' | 'confirmReset'>('signup');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    confirmPassword: '',
  });
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (authStep === 'signup') {
        if (formData.password !== formData.confirmPassword) {
          toast.error('Passwords do not match');
          return;
        }
        if (!isValidUSPhone(formData.phone)) {
          toast.error('Please enter a valid 10-digit US phone number');
          return;
        }
        if (!isPasswordValid(formData.password)) {
          toast.error('Password does not meet requirements');
          return;
        }
        await signUp(
          formData.email,
          formData.password,
          formData.firstName,
          formData.lastName,
          formData.phone
        );
        setAuthStep('verify');
        toast.success('Verification code sent to your email!');
      } else {
        await signIn(formData.email, formData.password);
        toast.success('Welcome back to the family!');
      }
    } catch (error: unknown) {
      // Show backend error message if present
      let backendMsg = '';
      if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        if ('error' in errObj && typeof errObj.error === 'string') {
          backendMsg = errObj.error;
        } else if ('message' in errObj && typeof errObj.message === 'string') {
          backendMsg = errObj.message;
        }
      }
      if (backendMsg === 'ACCOUNT_PENDING_APPROVAL') {
        toast.error('Your account is pending approval. Please contact Andrew Mudge.');
      } else if (backendMsg === 'This email is registered with Google. Please sign in with Google.') {
        toast.error('This email is registered with Google. Please sign in with Google.');
      } else if (backendMsg) {
        toast.error(backendMsg);
      } else {
        toast.error(authStep === 'signup' ? 'Failed to create account' : 'Failed to sign in');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'phone') {
      // Format phone number as user types
      const formatted = formatPhoneInput(value);
      setFormData(prev => ({ ...prev, [field]: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await confirmSignUp(formData.email, verificationCode);
      toast.success('Account confirmed! Please sign in.');
      setAuthStep('signin');
      setFormData({ email: formData.email, password: '', firstName: '', lastName: '', phone: '', confirmPassword: '' });
      setVerificationCode('');
    } catch (error) {
      toast.error('Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await resetPassword(formData.email);
      toast.success('Reset code sent to your email!');
      setAuthStep('confirmReset');
    } catch (error) {
      toast.error('Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await confirmResetPassword(formData.email, verificationCode, formData.password);
      toast.success('Password reset successfully! Please sign in.');
      setAuthStep('signin');
      setFormData({ email: formData.email, password: '', firstName: '', lastName: '', phone: '', confirmPassword: '' });
      setVerificationCode('');
    } catch (error) {
      toast.error('Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    // Use the callback page as the redirect URI
    const redirectUri = `${window.location.origin}/auth/callback`;
    const responseType = "token"; // Use implicit flow to get tokens in fragment
    const provider = "Google";

    window.location.href =
      `https://${domain}/oauth2/authorize?identity_provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=${responseType}&client_id=${clientId}&scope=openid+profile+email`;
  };

  if (!isAuthModalOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeAuthModal}
      >
        <motion.div
          className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative p-6 border-b border-gray-200">
            <button
              onClick={closeAuthModal}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-white rounded-full flex items-center justify-center border-2 border-red-600 shadow-lg">
                <Image 
                  src="/favicon.png" 
                  alt="Churchwell Family Logo" 
                  width={48}         // <-- Add the actual width in pixels
                  height={48}        // <-- Add the actual height in pixels
                  className="w-12 h-12 object-contain"
                />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">
                {authStep === 'signup' ? 'Join the Family' : 
                 authStep === 'verify' ? 'Verify Your Email' :
                 authStep === 'reset' ? 'Reset Password' :
                 authStep === 'confirmReset' ? 'Set New Password' :
                 'Welcome Back'}
              </h2>
              <p className="text-gray-600 mt-2">
                {authStep === 'signup' ? 'Create your account to access family-only content' :
                 authStep === 'verify' ? 'Enter the code sent to your email' :
                 authStep === 'reset' ? 'Enter your email to reset password' :
                 authStep === 'confirmReset' ? 'Enter code and new password' :
                 'Sign in to access exclusive family content'}
              </p>
            </div>
          </div>

          {/* Email Verification Form */}
          {authStep === 'verify' ? (
            <form onSubmit={handleVerifyEmail} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verificationCode">Verification Code</Label>
                <Input
                  id="verificationCode"
                  type="text"
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="text-center text-lg tracking-widest"
                  maxLength={6}
                  required
                />
              </div>
              
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify Email'}
              </Button>
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setAuthStep('signup')}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Back to Sign Up
                </button>
              </div>
            </form>
          ) : authStep === 'reset' ? (
            /* Password Reset Form */
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetEmail">Email</Label>
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </div>
              
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </Button>
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setAuthStep('signin')}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          ) : authStep === 'confirmReset' ? (
            /* Confirm Reset Form */
            <form onSubmit={handleConfirmReset} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetCode">Reset Code</Label>
                <Input
                  id="resetCode"
                  type="text"
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="text-center text-lg tracking-widest"
                  maxLength={6}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                />
              </div>
              
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                disabled={loading}
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          ) : (
          /* Main Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {authStep === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="firstName"
                        type="text"
                        placeholder="John"
                        value={formData.firstName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('firstName', e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="lastName"
                        type="text"
                        placeholder="Churchwell"
                        value={formData.lastName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('lastName', e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(123) 456-7890"
                      value={formData.phone}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('phone', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500">US numbers only. Enter 10 digits, formatting is automatic.</p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('email', e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleInputChange('password', e.target.value);
                    setShowPasswordRequirements(true);
                  }}
                  onFocus={() => setShowPasswordRequirements(true)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              {/* Password Requirements */}
              {authStep === 'signup' && showPasswordRequirements && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
                  <p className="text-sm font-medium text-gray-700 mb-2">Password Requirements:</p>
                  <ul className="space-y-1">
                    {validatePassword(formData.password).map((req, index) => (
                      <li key={index} className={`text-xs flex items-center ${
                        req.met ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        <span className={`w-4 h-4 rounded-full mr-2 flex items-center justify-center text-xs ${
                          req.met ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {req.met ? '✓' : '○'}
                        </span>
                        {req.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {authStep === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('confirmPassword', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || (authStep === 'signup' && !isPasswordValid(formData.password))}
            >
              {loading ? 'Processing...' : (authStep === 'signup' ? 'Create Account' : 'Sign In')}
            </Button>

            <div className="text-center space-y-2">
              {authStep === 'signin' && (
                <>
                  <button
                    type="button"
                    onClick={() => setAuthStep('reset')}
                    className="text-red-600 hover:text-red-700 text-sm block w-full"
                  >
                    Forgot your password?
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthStep('signup')}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Don&apos;t have an account? Sign up
                  </button>
                </>
              )}
              {authStep === 'signup' && (
                <button
                  type="button"
                  onClick={() => setAuthStep('signin')}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Already have an account? Sign in
                </button>
              )}
            </div>
          </form>
          )}

          {/* Social Auth Placeholder */}
          <div className="p-6 pt-0">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
              >
                Sign in with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled
              >
                Facebook (Coming Soon)
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AuthModal;