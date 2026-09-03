import { apiFetch } from "@/lib/api";
import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, ArrowRight, Shield, Code } from 'lucide-react';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

type FormData = z.infer<typeof schema>;

interface HomeProps { initialRole?: 'admin' | 'developer'; lockRole?: boolean; }

const Home: React.FC<HomeProps> = ({ initialRole = 'admin', lockRole = false }) => {
  const [, setLocation] = useLocation();

  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'admin' | 'developer'>(initialRole);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setServerError('');

    try {
      if (role === 'admin') {
        const form = new FormData();

        form.append('gmail', data.email);
        form.append('password', data.password);

        const response = await apiFetch('/api/admin/login', {
          method: 'POST',
          body: form,
          credentials: 'include',
        });

        const result = await response.json();

        if (!response.ok) {
          setServerError(result.detail || 'Login failed');
          return;
        }

        console.log('Admin logged in:');
        setLocation('/admin/dashboard');
        return;
      }

      const form = new FormData();

      form.append('email', data.email);
      form.append('password', data.password);

      const response = await apiFetch('/api/developer/login', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        setServerError(result.detail || 'Login failed');
        return;
      }
      console.log('Developer logged in');
      setLocation('/developer/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      setServerError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-panel rounded-lg p-8 w-full max-w-md"
      >
        {/* HEADER */}

        <div className="mb-7 text-center">
          <div className="flex justify-center mb-4">
            {role === 'admin' ? (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[hsl(172_92%_15%)]/10">
                <Shield className="w-7 h-7 text-[hsl(172_92%_15%)]" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[hsl(265_85%_55%)]/10">
                <Code className="w-7 h-7 text-[hsl(265_85%_55%)]" />
              </div>
            )}
          </div>

          <h2 className="font-serif font-bold text-3xl text-foreground mb-2">
            Welcome Back
          </h2>

          <p className="text-muted-foreground">
            Sign in to continue to the dashboard
          </p>
        </div>

        {/* ROLE TOGGLE */}

        {!lockRole && (
          <div className="flex bg-muted rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setRole('admin'); setServerError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${role === 'admin' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
            >
              <Shield className="w-4 h-4" /> Admin
            </button>
            <button
              type="button"
              onClick={() => { setRole('developer'); setServerError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${role === 'developer' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
            >
              <Code className="w-4 h-4" /> Developer
            </button>
          </div>
        )}

        {/* LOGIN FORM */}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* EMAIL */}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {role === 'admin' ? 'Admin Email' : 'Developer Email'}
            </label>

            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />

              <input
                type="email"
                {...register('email')}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-card focus:ring-2 focus:ring-[hsl(172_92%_15%)]/20 focus:border-[hsl(172_92%_15%)] outline-none transition-all text-foreground"
                placeholder={
                  role === 'admin'
                    ? 'admin@university.edu'
                    : 'developer@email.com'
                }
              />
            </div>

            {errors.email && (
              <p className="text-xs text-[hsl(0_70%_50%)] mt-1.5">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* PASSWORD */}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Password
            </label>

            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />

              <input
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-card focus:ring-2 focus:ring-[hsl(172_92%_15%)]/20 focus:border-[hsl(172_92%_15%)] outline-none transition-all text-foreground"
                placeholder="••••••••"
              />
            </div>

            {errors.password && (
              <p className="text-xs text-[hsl(0_70%_50%)] mt-1.5">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* SHOW PASSWORD */}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="w-4 h-4 rounded"
            />

            <span className="text-muted-foreground">
              Show password
            </span>
          </label>

          {/* SERVER ERROR */}

          {serverError && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-[hsl(0_70%_50%)] text-center"
            >
              {serverError}
            </motion.p>
          )}

          {/* LOGIN BUTTON */}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3.5 rounded-xl green-bg text-white font-semibold hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading
              ? 'Signing in...'
              : role === 'admin'
                ? 'Sign In as Admin'
                : 'Sign In as Developer'}

            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>
        </form>

        {/* ROLE DESCRIPTION */}

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            {role === 'admin'
              ? 'Admin access allows candidate and event management.'
              : 'Developer access allows major and account management.'}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Home;