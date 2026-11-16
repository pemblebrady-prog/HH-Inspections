import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import { GUIDES, guidesFor } from "../../lib/helpGuides";
import AppHeader from "../AppHeader";

export const dynamic = "force-dynamic";

// ☰ → Help: step-by-step guide with screenshots for the signed-in person's role.
// Admins can switch between all four guides; company owners also get the inspector guide.
export default async function Help({ searchParams }) {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/help");
  const mine = guidesFor(profile.role);
  const pick = searchParams && searchParams.guide;
  const guide = mine.find((g) => g.role === pick) || mine[0];
  return (
    <>
      <AppHeader title="Help" profile={profile} />
      <main className="shell help">
        {mine.length > 1 && (
          <nav className="help-tabs" aria-label="Guides">
            {mine.map((g) => <a key={g.role} href={`/help?guide=${g.role}`} className={g.role === guide.role ? "on" : ""} aria-current={g.role === guide.role ? "page" : undefined}>{g.title}</a>)}
          </nav>
        )}
        <h1>{guide.title}: how to use the portal</h1>
        <p className="help-intro">{guide.intro}</p>
        <ol className="help-toc">{guide.steps.map((st, i) => <li key={i}><a href={`#step-${i + 1}`}>{st.title}</a></li>)}</ol>
        {guide.steps.map((st, i) => (
          <section key={i} id={`step-${i + 1}`} className="card help-step">
            <h2><span className="help-num">{i + 1}</span>{st.title}</h2>
            {st.text.map((t, j) => <p key={j}>{t}</p>)}
            {st.tips && st.tips.map((t, j) => <p key={"t" + j} className="help-tip"><b>Tip:</b> {t}</p>)}
            {st.shots && (
              <div className={"help-shots" + (st.shots.every((x) => x.phone) ? " phone" : "")}>
                {st.shots.map((sh) => (
                  <figure key={sh.src}>
                    <a href={sh.src} target="_blank" rel="noreferrer"><img src={sh.src} alt={sh.alt} loading="lazy" /></a>
                    <figcaption>{sh.alt}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        ))}
        <p className="hint" style={{ marginTop: 24 }}>Screenshots use sample data. Questions? Call the office at 520-599-7798.</p>
      </main>
    </>
  );
}
