import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed) redirect("/dashboard");

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-10">
      <OnboardingWizard
        userId={user.id}
        initialName={profile?.full_name ?? ""}
      />
    </div>
  );
}
