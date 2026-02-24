/**
 * Backfill organizations — syncs features & limits to match plan config.
 * Run with: npx tsx src/scripts/backfill-org-plans.ts
 */
import { db } from '../db/connection'
import { organizations } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getPlanConfig } from '../config/plans'

async function main() {
  const orgs = await db.select({
    id: organizations.id,
    name: organizations.name,
    plan: organizations.plan,
    features: organizations.features,
    maxSeats: organizations.maxSeats,
    maxConversationsPerMonth: organizations.maxConversationsPerMonth,
    maxLeads: organizations.maxLeads,
    maxKnowledgeBases: organizations.maxKnowledgeBases,
    maxStorageMb: organizations.maxStorageMb,
  }).from(organizations)

  let updated = 0
  for (const org of orgs) {
    const plan = org.plan === 'free' ? 'starter' : (org.plan || 'starter')
    const cfg = getPlanConfig(plan)
    const expectedSeats = cfg.seats === -1 ? 999999 : cfg.seats
    const expectedConvs = cfg.conversationsPerMonth === -1 ? 999999 : cfg.conversationsPerMonth
    const expectedLeads = cfg.leads === -1 ? 999999 : cfg.leads
    const expectedKbs = cfg.knowledgeBases === -1 ? 999999 : cfg.knowledgeBases
    const expectedStorage = cfg.storageMb === -1 ? 999999 : cfg.storageMb

    const featuresEmpty = !org.features || (Array.isArray(org.features) && org.features.length === 0)
    const limitsStale = org.maxSeats !== expectedSeats ||
      org.maxConversationsPerMonth !== expectedConvs ||
      org.maxLeads !== expectedLeads ||
      org.maxKnowledgeBases !== expectedKbs ||
      org.maxStorageMb !== expectedStorage

    if (featuresEmpty || limitsStale) {
      await db.update(organizations)
        .set({
          plan,
          features: cfg.features,
          maxSeats: expectedSeats,
          maxConversationsPerMonth: expectedConvs,
          maxLeads: expectedLeads,
          maxKnowledgeBases: expectedKbs,
          maxStorageMb: expectedStorage,
        })
        .where(eq(organizations.id, org.id))

      updated++
      console.log(`  [OK] ${org.name} (${org.id}) -> plan=${plan}, seats=${expectedSeats}, features=[${cfg.features.join(', ')}]`)
    } else {
      console.log(`  [SKIP] ${org.name} (${org.id}) — already up to date`)
    }
  }

  console.log(`\nDone. ${updated}/${orgs.length} organizations updated.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
