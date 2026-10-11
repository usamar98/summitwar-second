import fs from 'node:fs';
fs.copyFileSync('supabase/schema.sql','supabase/migrations/20261011160707_summitwar.sql');
if(fs.existsSync('supabase/submission-upgrade.sql'))fs.copyFileSync('supabase/submission-upgrade.sql','supabase/migrations/20261011172940_simplify_submissions.sql');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
lock.packages[''].dependencies=pkg.dependencies;
lock.packages[''].devDependencies=pkg.devDependencies;
fs.writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n');
