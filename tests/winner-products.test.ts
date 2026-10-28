import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({configured:vi.fn(),one:null as any,rows:[] as any[],error:null as any,select:vi.fn(),eq:vi.fn(),in:vi.fn(),db:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({configured:mock.configured,db:mock.db}));
import {winnerProduct,winnerProductIds} from '../src/lib/winner-products';
beforeEach(()=>{
 vi.clearAllMocks();mock.configured.mockReturnValue(true);mock.one=null;mock.rows=[];mock.error=null;
 const q:any={select:(...args:any[])=>{mock.select(...args);return q},eq:(...args:any[])=>{mock.eq(...args);return q},in:(...args:any[])=>{mock.in(...args);return q},maybeSingle:async()=>({data:mock.one,error:mock.error}),then:(resolve:any)=>resolve({data:mock.rows,error:mock.error})};
 mock.db.mockReturnValue({from:()=>q});
});
it('denies ordinary approved products and ownership without a recorded championship',async()=>{
 for(const entries of [[],[{champions:[]}],undefined]){
  mock.one={id:'participant',owner_id:'founder',published:true,entries};
  expect(await winnerProduct('slug','participant')).toBeNull();
 }
 expect(mock.select).toHaveBeenCalledWith('*,entries!inner(champions!inner(tournament_id))');
 expect(mock.eq).toHaveBeenCalledWith('published',true);
});
it('returns an actual winner without exposing the internal championship relation',async()=>{
 mock.one={id:'winner',slug:'winner',published:true,entries:[{champions:[{tournament_id:'edition'}]}]};
 expect(await winnerProduct('slug','winner')).toEqual({id:'winner',slug:'winner',published:true});
 expect(mock.eq).toHaveBeenCalledWith('slug','winner');
});
it('uses the same championship rule for share images addressed by product ID',async()=>{
 mock.one={id:'winner',published:true,entries:[{champions:[{tournament_id:'edition'}]}]};
 expect((await winnerProduct('id','winner'))?.id).toBe('winner');
 expect(mock.eq).toHaveBeenCalledWith('id','winner');
});
it('filters directory and dashboard links to recorded winners only',async()=>{
 mock.rows=[{id:'winner',entries:[{champions:[{tournament_id:'edition'}]}]},{id:'participant',entries:[{champions:[]}]}];
 expect([...(await winnerProductIds(['winner','participant','winner']))]).toEqual(['winner']);
 expect(mock.in).toHaveBeenCalledWith('id',['winner','participant']);
});
it('fails closed on a provider error and avoids queries for missing configuration or IDs',async()=>{
 mock.error={message:'Provider unavailable'};await expect(winnerProduct('slug','winner')).rejects.toThrow('temporarily unavailable');
 await expect(winnerProductIds(['winner'])).rejects.toThrow('temporarily unavailable');
 mock.db.mockClear();mock.configured.mockReturnValue(false);
 expect(await winnerProduct('slug','winner')).toBeNull();expect([...(await winnerProductIds([]))]).toEqual([]);expect(mock.db).not.toHaveBeenCalled();
});
