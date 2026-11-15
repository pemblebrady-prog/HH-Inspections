"use client";

// Under the certification-tags photos: what was read from the tag / data plate.
export default function TagFinding({ find, f, setVal }) {
  if (!find) return null;
  const tags = find.hudTags || [], plate = find.dataPlate;
  const photoTags = tags.join(", ");
  const typed = String(f.hudTagNumbers || "").trim();
  const same = typed && tags.length && tags.every((t) => typed.toUpperCase().replace(/\s+/g, " ").includes(t));
  return (
    <div className="tag-find">
      {tags.length > 0 && (
        same ? <p><b>HUD tag{tags.length > 1 ? "s" : ""} read from the photo:</b> {photoTags}. Matches what's entered.</p> : typed && typed !== photoTags ? (
          <p><b>The photo shows</b> {photoTags}, but HUD tag numbers says "{typed}".{" "}
            <button type="button" className="viewswitch" onClick={() => setVal("hudTagNumbers", photoTags)}>Use {photoTags}</button></p>
        ) : <p><b>HUD tag{tags.length > 1 ? "s" : ""} read from the photo:</b> {photoTags}. Added to HUD tag numbers; please double-check every digit.</p>
      )}
      {plate && (
        <p><b>Data plate:</b> {[plate.manufacturer, plate.model && `model ${plate.model}`, plate.yearBuilt && `built ${plate.yearBuilt}`, plate.serial && `serial ${plate.serial}`].filter(Boolean).join(" · ")}
          {plate.yearBuilt && String(f.ageOfHome || "") !== plate.yearBuilt && <>{" "}<button type="button" className="viewswitch" onClick={() => setVal("ageOfHome", plate.yearBuilt)}>Use {plate.yearBuilt} as year built</button></>}</p>
      )}
    </div>
  );
}
