// Somente configuração pública. Nenhum segredo entra no arquivo ou no bundle.
// Também permite publicação pelo painel sem criar um token de CI abrangente.
export const publicDefaults = Object.freeze({
    APP_ID: 'caderno-estudos',
    APP_URL: 'https://caderno-estudos-alpha.vercel.app/',
    WORKER_URL: 'https://caderno-estudos-payments.migueltiojhoe.workers.dev',
    FIREBASE_PROJECT_ID: 'caderno-estudos-7adbd',
    MP_ENVIRONMENT: 'sandbox',
    CHECKOUT_ENABLED: 'false',
    PLAN_ID: 'caderno-vitalicio-299-v1',
    PLAN_TITLE: 'Caderno de Estudos — acesso vitalício',
    PLAN_AMOUNT_CENTS: '299',
    MP_COLLECTOR_ID: 'auto',
});
