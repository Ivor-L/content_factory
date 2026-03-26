#!/usr/bin/env tsx

/**
 * 将指定用户的风格预设提升为系统级（userId = null），对所有用户可见。
 *
 * 使用方法:
 *   npx tsx scripts/promote-user-styles.ts --email=591905097@qq.com
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import prisma from '../lib/prisma';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const args = process.argv.slice(2);
  const emailArg = args.find(a => a.startsWith('--email='));
  const email = emailArg?.split('=')[1];

  if (!email) {
    console.error('Usage: npx tsx scripts/promote-user-styles.ts --email=<email>');
    process.exit(1);
  }

  // Look up user UUID via Supabase Admin API
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error(`Failed to list users: ${error.message}`);

  const user = data.users.find(u => u.email === email);
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Found user: ${user.id} (${user.email})`);

  // Find all style presets for this user
  const presets = await prisma.stylePreset.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, metadata: true },
  });

  if (presets.length === 0) {
    console.log('No style presets found for this user.');
    process.exit(0);
  }

  console.log(`\nFound ${presets.length} preset(s):`);
  presets.forEach(p => {
    const meta = p.metadata as Record<string, any> ?? {};
    console.log(`  - ${p.name} [${p.id}] status=${meta.processingStatus ?? 'unknown'}`);
  });

  // Promote all to system level
  const result = await prisma.stylePreset.updateMany({
    where: { userId: user.id },
    data: { userId: null },
  });

  console.log(`\n✅ Promoted ${result.count} preset(s) to system-level (userId = null).`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
