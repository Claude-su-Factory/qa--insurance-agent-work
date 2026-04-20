import { redirect } from "next/navigation";
import LandingNav from "./components/LandingNav";
import LandingHero from "./components/LandingHero";
import LandingProductFrame from "./components/LandingProductFrame";
import LandingFeatures from "./components/LandingFeatures";
import LandingCTA from "./components/LandingCTA";
import LandingFooter from "./components/LandingFooter";
import AdSenseSlot from "./components/AdSenseSlot";
import { createClient } from "./lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-alt)" }}>
      <LandingNav />
      <main>
        <LandingHero />
        <LandingProductFrame />
        <LandingFeatures />
        <AdSenseSlot variant="inline" />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
