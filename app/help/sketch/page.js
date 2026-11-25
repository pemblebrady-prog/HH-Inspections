import { getCurrentProfile } from "../../../lib/supabase/server";
import { TAGS } from "../../../lib/sketchKey";
import AppHeader from "../../AppHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "How to do the sketch · House & Home" };

// How to do the home sketch (Nov 24): linked from the sketch editor, the Home sketch step and Help.
const STEPS = [
  ["Open the sketch", ["On the Home sketch step, tap Draw the sketch. The editor opens full screen with the home already drawn.",
    "Prefer paper? Under the Draw button, tap \"Prefer paper? Upload a photo of a hand drawing instead\" and take a clear, straight-on photo of your drawing."]],
  ["Set the home's size", ["Pick Single, Double or Triple, then type the length and width in feet. The home is redrawn to scale with the measurements on it.",
    "Already entered the length and width in Home basics? They're used automatically."]],
  ["Add attached structures", ["Tap + Add structure and pick what's attached: porch, covered porch, deck, steps, ramp, carport, awning, addition, garage or other.",
    "Pick a typical size or type the exact measurements, then choose which side of the home it's on. Drag the box along the side to put it in the right spot. Tap it again any time to change or delete it."]],
  ["Place the letter tags", ["Tap a letter in the key below the drawing (for example T for tie-down), then tap the drawing everywhere it goes. Each tap places one. Nothing is placed until you tap the drawing.",
    "Or press and drag a letter straight from the key up onto the drawing and let go where it belongs.",
    "Tap a different letter to switch. Tap Done when you're finished with tags."]],
  ["Move or remove tags", ["Drag any placed tag to move it. Tap a tag to select it, then Delete tag to remove just that one.",
    "Delete all removes every tag of that letter at once (for example every T). Made a mistake? Undo steps back."]],
  ["Zoom in for detail", ["Pinch with two fingers to zoom in and out. When zoomed in, drag the empty drawing with one finger to move around.",
    "On a computer, use the + and − buttons in the corner (or pinch on a trackpad). Fit shows the whole sketch again."]],
  ["North and the street", ["Use ↺ N and N ↻ to point the north arrow the right way (or tap the arrow on the drawing).",
    "Type the street name and pick the side of the home it's on. It's drawn along that edge."]],
  ["Save", ["Tap Save sketch, at the top or under the drawing. The sketch is added to the report as an image with the measurements and the letter key.",
    "You can come back and tap Edit the drawing any time before you submit. After submitting, use Add photos on My jobs."]],
];

export default async function SketchHelp() {
  const profile = await getCurrentProfile();
  return (
    <>
      <AppHeader title="Help" profile={profile} />
      <main className="shell help">
        <p className="hint"><a href="/help">← All help</a></p>
        <h1>How to do the sketch</h1>
        <p className="help-intro">The sketch shows the engineer the home's layout: its size, anything attached to it, which way is north, the street, and where you found tie-downs, piers, access points and problems. It takes a couple of minutes.</p>
        <ol className="help-toc">{STEPS.map(([t], i) => <li key={t}><a href={`#s${i + 1}`}>{t}</a></li>)}<li><a href="#key">What the letters mean</a></li></ol>
        {STEPS.map(([title, text], i) => (
          <section key={title} id={`s${i + 1}`} className="card help-step">
            <h2><span className="help-num">{i + 1}</span>{title}</h2>
            {text.map((t, j) => <p key={j}>{t}</p>)}
          </section>
        ))}
        <section id="key" className="card help-step">
          <h2>What the letters mean</h2>
          <p>Black boxes mark what's there. Red boxes mark what you inspected or any problem areas.</p>
          <div className="sk-keylist">
            {TAGS.map(([code, label, c]) => (
              <div key={code}><span className={"sk-keybox" + (c === "r" ? " red" : "")}>{code}</span>{label}</div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
