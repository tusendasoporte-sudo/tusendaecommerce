const COLLECTION = 'store_notifications';

function cleanBaseUrl(value) {
  return String(value || '').replace(/\/$/, '');
}

function escapeFilterValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizePb(pb) {
  if (!pb) return null;
  if (typeof pb.collection === 'function') return { mode: 'sdk', pb };
  const baseUrl = cleanBaseUrl(pb.baseUrl || pb.url || pb.pocketbaseUrl || pb.POCKETBASE_URL);
  return baseUrl ? { mode: 'rest', baseUrl, token: pb.token || pb.authToken || '' } : null;
}

async function request(pb, path, options = {}) {
  const client = normalizePb(pb);
  if (!client) throw new Error('PocketBase client is not configured.');

  if (client.mode === 'sdk') {
    return options.sdk(client.pb.collection(COLLECTION));
  }

  const headers = Object.assign({}, options.headers || {});
  if (client.token) headers.Authorization = `Bearer ${client.token}`;
  const response = await fetch(`${client.baseUrl}${path}`, Object.assign({}, options, { headers }));
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || 'PocketBase request failed.');
  return result;
}

async function collectionList(pb, filter, options = {}) {
  const client = normalizePb(pb);
  if (!client) throw new Error('PocketBase client is not configured.');

  if (client.mode === 'sdk') {
    return client.pb.collection(COLLECTION).getList(options.page || 1, options.perPage || 50, {
      filter,
      sort: options.sort || '-created',
      fields: options.fields,
    });
  }

  const query = new URLSearchParams();
  query.set('filter', filter);
  query.set('page', String(options.page || 1));
  query.set('perPage', String(options.perPage || 50));
  if (options.sort) query.set('sort', options.sort);
  if (options.fields) query.set('fields', options.fields);
  return request(pb, `/api/collections/${COLLECTION}/records?${query.toString()}`, {
    method: 'GET',
    headers: {},
    sdk: () => null,
  });
}

async function collectionCreate(pb, payload) {
  return request(pb, `/api/collections/${COLLECTION}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    sdk: (collection) => collection.create(payload),
  });
}

async function collectionUpdate(pb, id, payload) {
  return request(pb, `/api/collections/${COLLECTION}/records/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    sdk: (collection) => collection.update(id, payload),
  });
}

export function normalizeNotification(record) {
  const item = record || {};
  return {
    id: item.id || '',
    store: item.store || '',
    type: item.type || 'system_warning',
    title: item.title || 'Notificacion',
    message: item.message || '',
    status: item.status || 'unread',
    priority: item.priority || 'normal',
    targetUrl: item.target_url || '',
    entityCollection: item.entity_collection || '',
    entityId: item.entity_id || '',
    metadata: item.metadata_json || {},
    readAt: item.read_at || '',
    created: item.created || '',
    updated: item.updated || '',
    raw: item,
  };
}

export async function loadNotifications({ pb, storeId, limit = 12 }) {
  try {
    const store = escapeFilterValue(storeId);
    const result = await collectionList(pb, `store="${store}" && status!="archived"`, {
      page: 1,
      perPage: limit,
      sort: '-created',
    });
    return (result.items || []).map(normalizeNotification);
  } catch (error) {
    console.warn('Could not load store notifications.', error);
    return [];
  }
}

export async function loadUnreadNotificationCount({ pb, storeId }) {
  try {
    const store = escapeFilterValue(storeId);
    const result = await collectionList(pb, `store="${store}" && status="unread"`, {
      page: 1,
      perPage: 1,
      fields: 'id',
    });
    return Number(result.totalItems || 0);
  } catch (error) {
    console.warn('Could not load unread notification count.', error);
    return 0;
  }
}

export async function loadVisibleNotificationCount({ pb, storeId }) {
  try {
    const store = escapeFilterValue(storeId);
    const result = await collectionList(pb, `store="${store}" && status!="archived"`, {
      page: 1,
      perPage: 1,
      fields: 'id',
    });
    return Number(result.totalItems || 0);
  } catch (error) {
    console.warn('Could not load visible notification count.', error);
    return 0;
  }
}

export async function loadUnreadNotificationPrioritySummary({ pb, storeId }) {
  try {
    const store = escapeFilterValue(storeId);

    const [critical, important, unread] = await Promise.all([
      collectionList(pb, `store="${store}" && status="unread" && priority="critical"`, {
        page: 1,
        perPage: 1,
        fields: 'id',
      }),
      collectionList(pb, `store="${store}" && status="unread" && priority="important"`, {
        page: 1,
        perPage: 1,
        fields: 'id',
      }),
      collectionList(pb, `store="${store}" && status="unread"`, {
        page: 1,
        perPage: 1,
        fields: 'id',
      }),
    ]);

    const count = Number(unread.totalItems || 0);
    let highestPriority = 'normal';

    if (Number(critical.totalItems || 0) > 0) {
      highestPriority = 'critical';
    } else if (Number(important.totalItems || 0) > 0) {
      highestPriority = 'important';
    }

    return { count, highestPriority };
  } catch (error) {
    console.warn('Could not load unread notification priority summary.', error);
    return { count: 0, highestPriority: 'normal' };
  }
}

export async function markNotificationRead({ pb, notificationId }) {
  try {
    return normalizeNotification(await collectionUpdate(pb, notificationId, {
      status: 'read',
      read_at: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('Could not mark notification as read.', error);
    return null;
  }
}

export async function archiveNotification({ pb, notificationId }) {
  try {
    if (!notificationId) return null;
    return normalizeNotification(await collectionUpdate(pb, notificationId, {
      status: 'archived',
      read_at: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('Could not archive notification.', error);
    return null;
  }
}

export async function markAllNotificationsRead({ pb, storeId }) {
  try {
    const store = escapeFilterValue(storeId);
    const result = await collectionList(pb, `store="${store}" && status="unread"`, {
      page: 1,
      perPage: 100,
      fields: 'id',
    });
    const ids = (result.items || []).map((item) => item.id).filter(Boolean);
    await Promise.all(ids.map((id) => collectionUpdate(pb, id, {
      status: 'read',
      read_at: new Date().toISOString(),
    })));
    return ids.length;
  } catch (error) {
    console.warn('Could not mark all notifications as read.', error);
    return 0;
  }
}

export async function loadNotificationsPage({ pb, storeId, page = 1, perPage = 24 }) {
  try {
    const store = escapeFilterValue(storeId);
    const result = await collectionList(pb, `store="${store}" && status!="archived"`, {
      page,
      perPage,
      sort: '-created',
    });

    return {
      items: (result.items || []).map(normalizeNotification),
      page: Number(result.page || page || 1),
      perPage: Number(result.perPage || perPage || 24),
      totalItems: Number(result.totalItems || 0),
      totalPages: Number(result.totalPages || 1),
    };
  } catch (error) {
    console.warn('Could not load notifications page.', error);
    return {
      items: [],
      page: 1,
      perPage,
      totalItems: 0,
      totalPages: 1,
    };
  }
}

export async function archiveAllNotifications({ pb, storeId }) {
  try {
    const store = escapeFilterValue(storeId);
    let archived = 0;

    for (let index = 0; index < 50; index += 1) {
      const result = await collectionList(pb, `store="${store}" && status!="archived"`, {
        page: 1,
        perPage: 100,
        fields: 'id',
        sort: '-created',
      });

      const ids = (result.items || []).map((item) => item.id).filter(Boolean);
      if (!ids.length) break;

      const now = new Date().toISOString();

      await Promise.all(ids.map((id) => collectionUpdate(pb, id, {
        status: 'archived',
        read_at: now,
      })));

      archived += ids.length;
      if (ids.length < 100) break;
    }

    return archived;
  } catch (error) {
    console.warn('Could not archive all notifications.', error);
    return 0;
  }
}

export async function createStoreNotification({
  pb,
  storeId,
  type,
  title,
  message,
  priority = 'normal',
  targetUrl = '',
  entityCollection = '',
  entityId = '',
  metadata = {},
}) {
  try {
    if (!storeId) return null;
    const payload = {
      store: storeId,
      type,
      title,
      message,
      status: 'unread',
      priority,
      target_url: targetUrl,
      entity_collection: entityCollection,
      entity_id: entityId,
      metadata_json: metadata || {},
    };
    return normalizeNotification(await collectionCreate(pb, payload));
  } catch (error) {
    console.warn('Could not create store notification.', error);
    return null;
  }
}

export async function ensureStoreNotification({
  pb,
  storeId,
  type,
  entityCollection = '',
  entityId = '',
  title,
  message,
  priority = 'normal',
  targetUrl = '',
  metadata = {},
}) {
  try {
    if (!storeId || !type || !entityCollection || !entityId) return createStoreNotification({
      pb,
      storeId,
      type,
      title,
      message,
      priority,
      targetUrl,
      entityCollection,
      entityId,
      metadata,
    });

    const baseFilterParts = [
      `store="${escapeFilterValue(storeId)}"`,
      `type="${escapeFilterValue(type)}"`,
      `entity_collection="${escapeFilterValue(entityCollection)}"`,
      `entity_id="${escapeFilterValue(entityId)}"`,
    ];

    const archivedFilter = baseFilterParts.concat('status="archived"').join(' && ');
    const archived = await collectionList(pb, archivedFilter, { page: 1, perPage: 1, sort: '-updated' });
    const archivedCurrent = (archived.items || [])[0];
    if (archivedCurrent) return normalizeNotification(archivedCurrent);

    const unreadFilter = baseFilterParts.concat('status="unread"').join(' && ');
    const existing = await collectionList(pb, unreadFilter, { page: 1, perPage: 1, sort: '-created' });
    const current = (existing.items || [])[0];
    if (current) return normalizeNotification(current);
    return createStoreNotification({
      pb,
      storeId,
      type,
      title,
      message,
      priority,
      targetUrl,
      entityCollection,
      entityId,
      metadata,
    });
  } catch (error) {
    console.warn('Could not ensure store notification.', error);
    return null;
  }
}

export async function ensureStoreNotificationAnyStatus({
  pb,
  storeId,
  type,
  entityCollection = '',
  entityId = '',
  title,
  message,
  priority = 'normal',
  targetUrl = '',
  metadata = {},
}) {
  try {
    if (!storeId || !type || !entityCollection || !entityId) {
      return createStoreNotification({
        pb,
        storeId,
        type,
        title,
        message,
        priority,
        targetUrl,
        entityCollection,
        entityId,
        metadata,
      });
    }

    const filter = [
      `store="${escapeFilterValue(storeId)}"`,
      `type="${escapeFilterValue(type)}"`,
      `entity_collection="${escapeFilterValue(entityCollection)}"`,
      `entity_id="${escapeFilterValue(entityId)}"`,
    ].join(' && ');

    const existing = await collectionList(pb, filter, {
      page: 1,
      perPage: 1,
      sort: '-created',
    });

    const current = (existing.items || [])[0];
    if (current) return normalizeNotification(current);

    return createStoreNotification({
      pb,
      storeId,
      type,
      title,
      message,
      priority,
      targetUrl,
      entityCollection,
      entityId,
      metadata,
    });
  } catch (error) {
    console.warn('Could not ensure store notification by any status.', error);
    return null;
  }
}

export async function ensureStoreNotificationAfterSourceChange({
  pb,
  storeId,
  type,
  entityCollection = '',
  entityId = '',
  title,
  message,
  priority = 'normal',
  targetUrl = '',
  metadata = {},
  sourceUpdated = '',
}) {
  try {
    if (!storeId || !type || !entityCollection || !entityId) {
      return createStoreNotification({
        pb,
        storeId,
        type,
        title,
        message,
        priority,
        targetUrl,
        entityCollection,
        entityId,
        metadata,
      });
    }

    const filter = [
      `store="${escapeFilterValue(storeId)}"`,
      `type="${escapeFilterValue(type)}"`,
      `entity_collection="${escapeFilterValue(entityCollection)}"`,
      `entity_id="${escapeFilterValue(entityId)}"`,
    ].join(' && ');

    const existing = await collectionList(pb, filter, {
      page: 1,
      perPage: 1,
      sort: '-created',
    });

    const current = (existing.items || [])[0];

    if (!current) {
      return createStoreNotification({
        pb,
        storeId,
        type,
        title,
        message,
        priority,
        targetUrl,
        entityCollection,
        entityId,
        metadata,
      });
    }

    if (current.status === 'unread') return normalizeNotification(current);

    const sourceDate = sourceUpdated ? new Date(sourceUpdated) : null;
    const currentDate = current.updated || current.created ? new Date(current.updated || current.created) : null;

    const sourceChangedAfterNotification =
      sourceDate &&
      currentDate &&
      !Number.isNaN(sourceDate.getTime()) &&
      !Number.isNaN(currentDate.getTime()) &&
      sourceDate.getTime() > currentDate.getTime() + 60000;

    if (!sourceChangedAfterNotification) return normalizeNotification(current);

    return createStoreNotification({
      pb,
      storeId,
      type,
      title,
      message,
      priority,
      targetUrl,
      entityCollection,
      entityId,
      metadata,
    });
  } catch (error) {
    console.warn('Could not ensure inventory notification after source change.', error);
    return null;
  }
}

export async function findStoreNotificationAnyStatus({
  pb,
  storeId,
  type,
  entityCollection = '',
  entityId = '',
}) {
  try {
    if (!storeId || !type || !entityCollection || !entityId) return null;

    const filter = [
      `store="${escapeFilterValue(storeId)}"`,
      `type="${escapeFilterValue(type)}"`,
      `entity_collection="${escapeFilterValue(entityCollection)}"`,
      `entity_id="${escapeFilterValue(entityId)}"`,
    ].join(' && ');

    const existing = await collectionList(pb, filter, {
      page: 1,
      perPage: 1,
      sort: '-created',
    });

    const current = (existing.items || [])[0];
    return current ? normalizeNotification(current) : null;
  } catch (error) {
    console.warn('Could not find store notification by any status.', error);
    return null;
  }
}
