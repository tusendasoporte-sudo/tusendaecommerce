/// <reference path="../pb_data/types.d.ts" />

const TICKETS = "admin_app_download_tickets";
const ASSIGNMENTS = "admin_app_release_assignments";
const ARTIFACTS = "admin_app_artifacts";
const PROFILES = "admin_app_release_profiles";
const EVENTS = "admin_app_release_events";
const PROFILE_FIELD_ID = "rel17871912001";

function relationId(record, field) {
  const value = record.get(field);
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

migrate((app) => {
  const tickets = app.findCollectionByNameOrId(TICKETS);
  const profiles = app.findCollectionByNameOrId(PROFILES);
  const assignment = tickets.fields.getByName("assignment");

  // Los tickets nuevos identifican la publicación, no una asignación individual.
  // La relación anterior queda opcional para consumir tickets heredados sin abrirlos.
  assignment.required = false;
  assignment.minSelect = 0;
  tickets.fields.add(new Field({
    cascadeDelete: false,
    collectionId: profiles.id,
    hidden: true,
    id: PROFILE_FIELD_ID,
    maxSelect: 1,
    minSelect: 0,
    name: "profile",
    presentable: false,
    required: false,
    system: false,
    type: "relation",
  }));
  app.save(tickets);

  const events = app.findCollectionByNameOrId(EVENTS);
  const action = events.fields.getByName("action");
  action.values = Array.from(new Set([...(action.values || []), "test_approved"]));
  app.save(events);

  const existing = app.findRecordsByFilter(TICKETS, "", "+created", 5000, 0) || [];
  for (const ticket of existing) {
    let profileId = "";
    const assignmentId = relationId(ticket, "assignment");
    if (assignmentId) {
      try {
        const legacy = app.findRecordById(ASSIGNMENTS, assignmentId);
        profileId = relationId(legacy, "profile");
      } catch (_) {}
    }
    if (!profileId) {
      try {
        const artifact = app.findRecordById(ARTIFACTS, relationId(ticket, "artifact"));
        profileId = relationId(artifact, "profile");
      } catch (_) {}
    }
    if (profileId) {
      ticket.set("profile", profileId);
      app.save(ticket);
    }
  }
}, (app) => {
  const globalTickets = app.findRecordsByFilter(TICKETS, "assignment = '' && profile != ''", "", 1, 0) || [];
  if (globalTickets.length) throw new Error("unsafe_rollback_admin_app_global_private_delivery");
  const approvals = app.findRecordsByFilter(EVENTS, "action = 'test_approved'", "", 1, 0) || [];
  if (approvals.length) throw new Error("unsafe_rollback_admin_app_global_private_delivery");

  const events = app.findCollectionByNameOrId(EVENTS);
  const action = events.fields.getByName("action");
  action.values = (action.values || []).filter((value) => value !== "test_approved");
  app.save(events);

  const tickets = app.findCollectionByNameOrId(TICKETS);
  tickets.fields.removeById(PROFILE_FIELD_ID);
  const assignment = tickets.fields.getByName("assignment");
  assignment.required = true;
  assignment.minSelect = 1;
  app.save(tickets);
});
