import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/user/not-found";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import React, { useEffect, useState } from "react";
import { apiFetch } from "./lib/api";

// User Pages
import Home from "./pages/user/Home";
import Vote from "./pages/user/Vote";
import VoteResult from "./pages/user/VoteResult";
import QREntry from "./pages/user/QREntry";

// Admin Pages
import AdminHome from "./pages/admin/Home";
import Dashboard from "./pages/admin/Dashboard";
import Organizer from "./pages/admin/Organizer";
import Results from "./pages/admin/Results";
import Developer from "./pages/developer/Developer";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/admin/me', { credentials: 'include' })
      .then((res) => {
        if (!active) return;
        if (!res.ok) { setLocation('/admin'); return; }
        setAllowed(true);
      })
      .catch(() => { if (active) setLocation('/admin'); });
    return () => { active = false; };
  }, [setLocation]);

  return allowed ? <>{children}</> : null;
}

function DeveloperEntry() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiFetch('/api/developer/me', { credentials: 'include' })
      .then((res) => {
        if (res.ok) setLocation('/developer/dashboard');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [setLocation]);

  if (checking) return null;
  return <AdminHome initialRole="developer" lockRole />;
}

function DeveloperGuard() {
  const [, setLocation] = useLocation();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    apiFetch('/api/developer/me', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) { setLocation('/developer'); return; }
        setAllowed(true);
      })
      .catch(() => setLocation('/developer'));
  }, [setLocation]);

  return allowed ? <Developer /> : null;
}

const queryClient = new QueryClient();

function Router() {
  return (
      <Switch>
        {/* User Routes */}
        <Route path="/" component={Home} />
        <Route path="/vote" component={Vote} />
        <Route path="/qr-entry" component={QREntry} />
        <Route path="/VoteResult" component={VoteResult} />

        {/* Admin Routes */}
        <Route path="/admin">
          <AdminHome initialRole="admin" />
        </Route>
        <Route path="/admin/dashboard"><AdminGuard><Dashboard /></AdminGuard></Route>
        <Route path="/admin/organizer"><AdminGuard><Organizer /></AdminGuard></Route>
        <Route path="/admin/results"><AdminGuard><Results /></AdminGuard></Route>
        <Route path="/developer" component={DeveloperEntry} />
        <Route path="/developer/dashboard" component={DeveloperGuard} />

        {/* Fallback Catch-All Route */}
        <Route component={NotFound} />
      </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base="">
            <Router /> 
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;