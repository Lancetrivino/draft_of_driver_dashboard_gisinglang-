import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import HistoryScreen from "./screens/HistoryScreen";
import ContactsScreen from "./screens/ContactsScreen";
import BottomNav from "./components/BottomNav";

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [roleChecked, setRoleChecked] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [tab, setTab] = useState("home");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session ?? null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (active) setSession(s);
    });
    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // A signed-in Supabase user isn't automatically a driver — Administrator
  // accounts exist too. Reject those here the same way the admin dashboard
  // rejects Driver accounts, so nobody lands on the wrong app by accident.
  useEffect(() => {
    if (!session) {
      setRoleChecked(false);
      setRoleError("");
      return;
    }
    let active = true;
    setRoleChecked(false);
    supabase
      .from("users")
      .select("role")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setRoleError("Could not verify your account role.");
        } else if (data.role !== "Driver") {
          setRoleError("This app is for driver accounts. Administrators should use the admin dashboard.");
          supabase.auth.signOut();
        }
        setRoleChecked(true);
      });
    return () => {
      active = false;
    };
  }, [session]);

  if (checking) {
    return (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  if (!roleChecked) {
    return (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  }

  if (roleError) {
    return (
      <div className="screen center">
        <div className="banner error" style={{ margin: 24 }}>
          {roleError}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <img src="/icons/icon-192.png" alt="" className="app-header-icon" width={22} height={22} />
        GisingLang
      </header>
      <main className="app-main">
        {tab === "home" && <HomeScreen user={session.user} />}
        {tab === "history" && <HistoryScreen />}
        {tab === "contacts" && <ContactsScreen user={session.user} />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
