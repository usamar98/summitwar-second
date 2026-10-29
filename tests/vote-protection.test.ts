import {it,expect,vi,afterEach} from 'vitest';
import {verifyVoteChallenge,voteNetwork} from '../src/lib/vote-protection';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
const localToken='XXXX.DUMMY.TOKEN.XXXX';
function localKeys(){vi.stubEnv('TURNSTILE_SECRET_KEY','1x0000000000000000000000000000000AA');vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY','1x00000000000000000000AA');}
it('validates Cloudflare dummy tokens on loopback development only',async()=>{
 localKeys();vi.stubEnv('NODE_ENV','development');
 const provider=vi.fn().mockImplementation(async()=>Response.json({success:true,hostname:'example.com'}));vi.stubGlobal('fetch',provider);
 for(const host of ['localhost','127.0.0.1','[::1]'])await expect(verifyVoteChallenge(new Request(`http://${host}:3000/api/vote-link`),localToken,true)).resolves.toBeUndefined();
 expect(provider).toHaveBeenCalledTimes(3);
 await expect(verifyVoteChallenge(new Request('http://localhost:3000/api/vote-link'),'not-a-dummy-token',true)).rejects.toThrow('Complete');
 provider.mockResolvedValue(Response.json({success:false}));
 await expect(verifyVoteChallenge(new Request('http://localhost:3000/api/vote-link'),localToken,true)).rejects.toThrow('failed');
});
it('rejects local test keys in production, tests, and non-loopback deployments',async()=>{
 localKeys();const provider=vi.fn();vi.stubGlobal('fetch',provider);
 for(const environment of ['production','test']){vi.stubEnv('NODE_ENV',environment);await expect(verifyVoteChallenge(new Request('http://localhost:3000/api/vote-link'),localToken,true)).rejects.toThrow('unavailable');}
 vi.stubEnv('NODE_ENV','development');await expect(verifyVoteChallenge(req(),localToken,true)).rejects.toThrow('unavailable');expect(provider).not.toHaveBeenCalled();
});
it('rejects partially configured test keys and preserves real host/action validation on localhost',async()=>{
 localKeys();vi.stubEnv('NODE_ENV','development');vi.stubEnv('TURNSTILE_SECRET_KEY','real-secret');
 const provider=vi.fn().mockResolvedValue(Response.json({success:true,hostname:'example.com'}));vi.stubGlobal('fetch',provider);
 await expect(verifyVoteChallenge(new Request('http://localhost:3000/api/vote-link'),localToken,true)).rejects.toThrow('unavailable');
 vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY','real-site');
 await expect(verifyVoteChallenge(new Request('http://localhost:3000/api/vote-link'),'real-token',true)).rejects.toThrow('failed');
});
const req=()=>new Request('https://summitwar.example/api/command',{headers:{'x-forwarded-for':'203.0.113.9'}});
it('checks server success, hostname, action, and token validity',async()=>{vi.stubEnv('TURNSTILE_SECRET_KEY','test-secret');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({success:true,hostname:'summitwar.example',action:'vote'})));await expect(verifyVoteChallenge(req(),'valid')).resolves.toBeUndefined();await expect(verifyVoteChallenge(req(),'')).rejects.toThrow('Complete');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({success:true,hostname:'evil.example',action:'vote'})));await expect(verifyVoteChallenge(req(),'forged')).rejects.toThrow('failed');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({success:true,hostname:'summitwar.example',action:'other'})));await expect(verifyVoteChallenge(req(),'wrong-action')).rejects.toThrow('failed');});
it('fails closed on provider errors and incomplete configuration',async()=>{vi.stubEnv('TURNSTILE_SECRET_KEY','test-secret');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));await expect(verifyVoteChallenge(req(),'token')).rejects.toThrow('unavailable');vi.stubEnv('TURNSTILE_SECRET_KEY','');vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY','public-key');await expect(verifyVoteChallenge(req(),'token')).rejects.toThrow('unavailable');});
