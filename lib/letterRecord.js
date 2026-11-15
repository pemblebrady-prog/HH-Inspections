// Save a new draft letter on a submission (and which engineer it was made for).
export async function recordLetter(db, match, r) {
  const base = { letter_doc_id: r.docId, letter_link: r.docLink };
  const [col, val] = match;
  const { error } = await db.from("submissions").update({ ...base, letter_engineer_id: r.engineerId || null }).eq(col, val);
  if (error && /letter_engineer_id/i.test(error.message || "")) await db.from("submissions").update(base).eq(col, val); // migration 0010 not run yet
  else if (error) throw error;
}
