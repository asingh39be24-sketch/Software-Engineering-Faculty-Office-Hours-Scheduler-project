export function logActivity(db, { actorId = null, action, entityType = null, entityId = null, details = null }) {
  db.prepare('INSERT INTO activity_log (actor_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
    actorId,
    action,
    entityType,
    entityId,
    details
  );
}

export function listActivity(db, { limit = 30, actorId } = {}) {
  return db
    .prepare(
      `SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.details, a.created_at AS createdAt,
              u.id AS actorId, u.name AS actorName, u.role AS actorRole
       FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
       ${actorId ? 'WHERE a.actor_id = ?' : ''}
       ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
    )
    .all(...(actorId ? [actorId, limit] : [limit]));
}
