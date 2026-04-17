import { redirect } from "next/navigation";
import LandingNav from "./components/LandingNav";
import LandingHero from "./components/LandingHero";
import LandingFeatures from "./components/LandingFeatures";
import LandingSteps from "./components/LandingSteps";
import LandingCTA from "./components/LandingCTA";
import LandingFooter from "./components/LandingFooter";
import { createClient } from "./lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingSteps />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
