import { HttpError } from './auth.js';

export function legacyUsers(users, cutoff) {
    const time = new Date(cutoff).getTime();
    if (!Array.isArray(users) || !Number.isFinite(time)) throw new HttpError(400, 'Inventário ou data de corte inválida.');
    const seen = new Set();
    return users.filter(user => {
        if (typeof user.localId !== 'string' || !/^[^/]{1,128}$/.test(user.localId) || seen.has(user.localId)) throw new HttpError(400, 'UID duplicado ou inválido no inventário.');
        seen.add(user.localId);
        const created = Number(user.createdAt);
        if (!Number.isSafeInteger(created) || created <= 0) throw new HttpError(400, 'Conta sem data de criação confiável.');
        return created < time;
    });
}

// Somente a ferramenta administrativa chama esta função; não existe rota HTTP de isenção.
export async function grantLegacyAccess(users, cutoff, migrationId, store, { dryRun = true } = {}) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(migrationId || '')) throw new HttpError(400, 'Identificador de migração inválido.');
    const selected = legacyUsers(users, cutoff);
    const report = { eligible: selected.length, alreadyGranted: 0, granted: 0, dryRun };
    for (const user of selected) {
        const result = await store.atomic(async tx => {
            const accessPath = 'access/' + user.localId;
            const profilePath = 'users/' + user.localId;
            const access = await tx.get(accessPath);
            const profile = await tx.get(profilePath);
            if (access?.data.legacy?.permanent && access.data.active && profile?.data.lifetimeAccess === true && profile.data.accessCount >= 1) return 'alreadyGranted';
            if (!dryRun) {
                tx.put(accessPath, {
                    ...(access?.data || {}), active: true, expiresAt: null,
                    legacy: access?.data.legacy?.permanent ? access.data.legacy : { permanent: true, migrationId, cutoffAt: new Date(cutoff) },
                }, access);
                tx.put(profilePath, {
                    ...(profile?.data || {}),
                    ...(!profile && user.email ? { email: user.email } : {}),
                    ...(!profile ? { createdAt: new Date(Number(user.createdAt)) } : {}),
                    lifetimeAccess: true, accessCount: Math.max(Number(profile?.data.accessCount) || 1, 1),
                }, profile);
            }
            return 'granted';
        });
        report[result]++;
    }
    return report;
}
