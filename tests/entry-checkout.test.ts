import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({requireUser:vi.fn(),db:vi.fn(),stripe:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({requireUser:mock.requireUser,db:mock.db,rpc:vi.fn()}));
vi.mock('../src/lib/stripe-client',()=>({stripe:mock.stripe}));
import {checkout} from '../src/lib/payments';
beforeEach(()=>{vi.clearAllMocks();mock.requireUser.mockResolvedValue({id:'owner'})});
it('never creates or resumes an entry charge, including old checkout links',async()=>{
 await expect(checkout('legacy-paid-entry')).rejects.toThrow('always free');
 expect(mock.db).not.toHaveBeenCalled();expect(mock.stripe).not.toHaveBeenCalled();
});
it('still requires a founder session for the retired checkout action',async()=>{
 mock.requireUser.mockRejectedValue(new Error('Sign in required'));
 await expect(checkout('entry')).rejects.toThrow('Sign in required');
 expect(mock.stripe).not.toHaveBeenCalled();
});
