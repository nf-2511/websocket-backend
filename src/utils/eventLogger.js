const User = require('../models/User');
const Conversation = require('../models/Conversation');

// Human-readable console log for every incoming socket event:
//   [Bekzod Mirzaaliyev] qo'ng'iroq qildi [Aziz Karimov] ga
// Resolving ids to names costs a DB read, so labels are cached with a short TTL
// (stale names in logs are acceptable; unbounded growth is not).

const TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 1000;
const userCache = new Map(); // userId -> { label, at }
const convCache = new Map(); // conversationId -> { conv: {isGroup,name,participants}, at }

// Payloads must never be dumped wholesale: they can carry passwords, OTP codes,
// tokens, message text and search queries. Only whitelisted fields are logged.
const SKIPPED_EVENTS = new Set([
    'call:ice-candidate', // dozens per call — pure WebRTC plumbing, floods the log
]);

const short = (id) => (id ? String(id).slice(-6) : '?');

const remember = (cache, key, value) => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { ...value, at: Date.now() });
};

const cached = (cache, key) => {
    const hit = cache.get(String(key));
    return hit && Date.now() - hit.at < TTL_MS ? hit : null;
};

async function userLabel(userId) {
    if (!userId) return "[noma'lum]";
    const key = String(userId);
    const hit = cached(userCache, key);
    if (hit) return hit.label;
    let label = `[user:${short(key)}]`;
    try {
        const u = await User.findById(key).select('firstName lastName email').lean();
        if (u) label = `[${[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}]`;
    } catch (_) {
        return label; // transient DB error — don't cache the fallback
    }
    remember(userCache, key, { label });
    return label;
}

const invalidateUserLabel = (userId) => userCache.delete(String(userId));

// DM -> the other participant's label, group -> `"Name" guruhi`.
async function conversationLabel(conversationId, actorId) {
    if (!conversationId) return "[noma'lum suhbat]";
    const key = String(conversationId);
    let hit = cached(convCache, key);
    if (!hit) {
        try {
            const conv = await Conversation.findById(key).select('isGroup name participants').lean();
            if (!conv) return `[conv:${short(key)}]`;
            hit = { conv };
            remember(convCache, key, hit);
        } catch (_) {
            return `[conv:${short(key)}]`;
        }
    }
    const { conv } = hit;
    if (conv.isGroup) return `"${conv.name || 'guruh'}" guruhi`;
    const other = (conv.participants || []).find((id) => String(id) !== String(actorId));
    return userLabel(other);
}

async function describe(socket, event, p) {
    const actor = socket.userId
        ? await userLabel(socket.userId)
        : p?.email
            ? `[${String(p.email).slice(0, 100)}]`
            : `[socket:${socket.id}]`;

    switch (event) {
        // auth (email only — never the password / OTP code)
        case 'auth:check-email': return `${actor} email tekshirdi`;
        case 'auth:login': return `${actor} login qildi`;
        case 'auth:register': return `${actor} ro'yxatdan o'tmoqda`;
        case 'auth:verify-otp': return `${actor} OTP kodini kiritdi`;
        case 'keys:publish': return `${actor} E2E kalitini e'lon qildi`;
        case 'keys:get': return `${actor} ${await userLabel(p?.userId)} ning E2E kalitini so'radi`;

        // presence
        case 'user:online': return `${actor} online bo'ldi`;
        case 'presence:check': return `${actor} presence tekshirdi (${(p?.userIds || []).length} ta user)`;
        case 'typing:start': return `${actor} yozmoqda — ${await conversationLabel(p?.conversationId, socket.userId)}`;
        case 'typing:stop': return `${actor} yozishni to'xtatdi — ${await conversationLabel(p?.conversationId, socket.userId)}`;

        // conversations
        case 'conversation:open': return `${actor} direct message ${await userLabel(p?.otherUserId)} ga kirdi`;
        case 'conversation:create-group': return `${actor} "${String(p?.name || '').slice(0, 60)}" guruh yaratdi (${(p?.memberIds || []).length + 1} a'zo)`;
        case 'conversation:add-member': return `${actor} ${await userLabel(p?.userId)} ni ${await conversationLabel(p?.conversationId, socket.userId)} ga qo'shdi`;
        case 'conversation:remove-member': return `${actor} ${await userLabel(p?.userId)} ni ${await conversationLabel(p?.conversationId, socket.userId)} dan chiqardi`;
        case 'conversation:list': return `${actor} suhbatlar ro'yxatini oldi`;
        case 'conversation:join': return `${actor} suhbatga ulandi — ${await conversationLabel(p?.conversationId, socket.userId)}`;
        case 'conversation:leave': return `${actor} suhbatdan chiqdi — ${await conversationLabel(p?.conversationId, socket.userId)}`;

        // messages (never the text/ciphertext)
        case 'message:send': return `${actor} message yubordi ${await conversationLabel(p?.conversationId, socket.userId)} ga${p?.encrypted ? ' (shifrlangan)' : ''}${(p?.attachments || []).length ? ` (${p.attachments.length} ta fayl)` : ''}`;
        case 'message:history': return `${actor} xabarlar tarixini oldi — ${await conversationLabel(p?.conversationId, socket.userId)}`;
        case 'message:edit': return `${actor} xabarni tahrirladi`;
        case 'message:delete': return `${actor} xabarni o'chirdi`;
        case 'message:react': return `${actor} xabarga ${p?.emoji || '?'} reaksiya qo'ydi`;
        case 'message:unreact': return `${actor} reaksiyani olib tashladi`;
        case 'message:read': return `${actor} xabarni o'qidi — ${await conversationLabel(p?.conversationId, socket.userId)}`;
        case 'messages:search': return `${actor} xabarlardan qidirdi — ${await conversationLabel(p?.conversationId, socket.userId)}`;

        // contacts / profile
        case 'user:get-chats': return `${actor} chat ro'yxatini oldi`;
        case 'users:search': return `${actor} foydalanuvchi qidirdi`;
        case 'user:update-profile':
            invalidateUserLabel(socket.userId); // name may have changed
            return `${actor} profilini yangiladi`;

        // moderation
        case 'user:block': return `${actor} ${await userLabel(p?.userId)} ni blokladi`;
        case 'user:unblock': return `${actor} ${await userLabel(p?.userId)} ni blokdan chiqardi`;
        case 'user:blocked-list': return `${actor} bloklanganlar ro'yxatini oldi`;
        case 'report:submit': return `${actor} ${await userLabel(p?.targetUserId)} ustidan shikoyat yubordi`;

        // calls
        case 'call:invite': return `${actor} qo'ng'iroq qildi ${await userLabel(p?.toUserId)} ga`;
        case 'call:answer': return `${actor} qo'ng'iroqni qabul qildi — ${await userLabel(p?.toUserId)}`;
        case 'call:reject': return `${actor} qo'ng'iroqni rad etdi — ${await userLabel(p?.toUserId)}`;
        case 'call:end': return `${actor} qo'ng'iroqni tugatdi — ${await userLabel(p?.toUserId)}`;

        // push
        case 'push:subscribe': return `${actor} push obunasini yoqdi`;
        case 'push:unsubscribe': return `${actor} push obunasini o'chirdi`;

        default: return `${actor} ${event}`;
    }
}

// Fire-and-forget: logging must never delay or break the actual handlers.
function logSocketEvent(socket, event, payload) {
    if (SKIPPED_EVENTS.has(event)) return;
    describe(socket, event, payload)
        .then((line) => console.log(`io» ${line}`))
        .catch(() => {});
}

module.exports = { logSocketEvent };
