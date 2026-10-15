import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizePhone } from "../theme";

export default function ContactsScreen({ user }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (!error) setContacts(data || []);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setFormError("");
    const normalized = normalizePhone(phone);
    if (!name.trim()) {
      setFormError("Enter a name.");
      return;
    }
    if (!normalized) {
      setFormError("Enter a valid PH mobile number, e.g. 0917 123 4567.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("emergency_contacts").insert({
      user_id: user.id,
      name: name.trim(),
      phone_number: normalized,
      relationship: relationship.trim() || null,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setName("");
    setPhone("");
    setRelationship("");
    load();
  }

  async function handleRemove(contactId) {
    if (!window.confirm("Remove this emergency contact?")) return;
    const { error } = await supabase.from("emergency_contacts").delete().eq("contact_id", contactId);
    if (!error) load();
  }

  const activeCount = contacts.filter((c) => c.is_active).length;

  if (loading) {
    return (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="screen">
      {activeCount === 0 && (
        <div className="banner warn">
          No emergency contacts. A COMBINED alert will not notify anyone until you add at least one.
        </div>
      )}

      <div className="card">
        <div className="card-title">Add contact</div>
        <form onSubmit={handleAdd}>
          <label htmlFor="c-name">Name</label>
          <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
          <label htmlFor="c-phone">Mobile number</label>
          <input
            id="c-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09171234567"
            inputMode="tel"
            required
          />
          <label htmlFor="c-rel">Relationship (optional)</label>
          <input
            id="c-rel"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Parent, spouse, sibling…"
          />
          {formError && <div className="error-text">{formError}</div>}
          <button type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add contact"}
          </button>
        </form>
      </div>

      <div className="event-list">
        {contacts.map((c) => (
          <div
            key={c.contact_id}
            className="event-row"
            style={{ borderLeftColor: c.is_active ? "#2fbf71" : "#8697a8" }}
          >
            <div className="event-row-top">
              <span>{c.name}</span>
              <button className="remove-btn" onClick={() => handleRemove(c.contact_id)}>
                Remove
              </button>
            </div>
            <div className="event-row-bottom muted small">
              {c.phone_number}
              {c.relationship ? ` · ${c.relationship}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
