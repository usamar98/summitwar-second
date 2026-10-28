import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({winner:vi.fn(),user:vi.fn(),db:vi.fn()}));
vi.mock('../src/lib/winner-products',()=>({winnerProduct:mock.winner}));
vi.mock('../src/lib/supabase',()=>({configured:()=>true,db:mock.db,user:mock.user}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')}}));
import ProductPage,{generateMetadata} from '../src/app/products/[slug]/page';
import {GET as shareImage} from '../src/app/api/og/[kind]/[id]/route';
beforeEach(()=>{vi.clearAllMocks();mock.winner.mockResolvedValue(null)});
it('returns not found for a non-winning startup, including a founder visiting their own application',async()=>{
 mock.user.mockResolvedValue({id:'founder'});
 await expect(ProductPage({params:Promise.resolve({slug:'participant'})})).rejects.toThrow('404');
 expect(mock.user).not.toHaveBeenCalled();expect(mock.db).not.toHaveBeenCalled();
});
it('does not index or generate a startup share image for a non-winner',async()=>{
 expect(await generateMetadata({params:Promise.resolve({slug:'participant'})})).toMatchObject({robots:{index:false,follow:false}});
 const response=await shareImage(new Request('https://summitwar.example/api/og/product/00000000-0000-4000-8000-000000000000'),{params:Promise.resolve({kind:'product',id:'00000000-0000-4000-8000-000000000000'})});
 expect(response.status).toBe(404);
});
it('rejects malformed product share-image IDs before accessing the database',async()=>{
 const response=await shareImage(new Request('https://summitwar.example/api/og/product/invalid'),{params:Promise.resolve({kind:'product',id:'invalid'})});
 expect(response.status).toBe(404);expect(mock.winner).not.toHaveBeenCalled();
});
it('generates startup metadata only for a recorded winner',async()=>{
 mock.winner.mockResolvedValue({id:'winner',name:'Winning app',tagline:'Useful tool'});
 expect(await generateMetadata({params:Promise.resolve({slug:'winner'})})).toMatchObject({title:'Winning app',description:'Useful tool',openGraph:{images:['/api/og/product/winner']}});
});
