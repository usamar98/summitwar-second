export const AUTH_RETURN_COOKIE='sw_auth_return';
// Voting returns to a known internal match route; arbitrary URLs never become redirects.
export function safeAuthReturn(value:unknown){return typeof value==='string'&&/^\/matches\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:'/dashboard'}
export function votingLoginPath(match:string){return `/login?mode=vote&next=${encodeURIComponent(safeAuthReturn('/matches/'+match))}`}
