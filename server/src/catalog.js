import { humanize } from './files.js'

function node(name, slug, prefix, children = []) {
  return { name, slug, prefix, children, seeded: true }
}

const SEED = [
  node('Investors', 'investors', 'investors/', [
    node('Financial Reports', 'financial-reports', 'investors/financial-reports/', [
      node('Annual Reports', 'annual-reports', 'investors/financial-reports/annual-reports/'),
      node('Quarterly Results', 'quarterly-results', 'investors/financial-reports/quarterly-results/'),
      node('Annual Accounts of Subsidiaries & JVs', 'annual-accounts-subsidiaries-jvs', 'investors/financial-reports/annual-accounts-subsidiaries-jvs/'),
    ]),
    node('Investor Resources', 'investor-resources', 'investors/investor-resources/', [
      node('Investor Presentation', 'investor-presentation', 'investors/investor-resources/investor-presentation/'),
      node('Earnings Call Transcripts', 'earnings-call-transcripts', 'investors/investor-resources/earnings-call-transcripts/'),
      node('Earnings Call Recording', 'earnings-call-recording', 'investors/investor-resources/earnings-call-recording/'),
      node('Shareholding Structure', 'shareholding-structure', 'investors/investor-resources/shareholding-structure/'),
      node('Top 200 Shareholders', 'top-200-shareholders', 'investors/investor-resources/top-200-shareholders/'),
      node('Policies', 'policies', 'investors/investor-resources/policies/'),
      node('Buyback 2022', 'buyback-2022', 'investors/investor-resources/buyback-2022/'),
      node('Forms', 'forms', 'investors/investor-resources/forms/'),
      node('Unclaimed Dividend & IEPF', 'unclaimed-dividend-and-iepf', 'investors/investor-resources/unclaimed-dividend-and-iepf/'),
    ]),
    node('Notice & Disclosures', 'notice-and-disclosures', 'investors/notice-and-disclosures/', [
      node('Notice of Board Meetings', 'notice-of-board-meetings', 'investors/notice-and-disclosures/notice-of-board-meetings/'),
      node('Schedule of Investor Meet', 'schedule-of-investor-meet', 'investors/notice-and-disclosures/schedule-of-investor-meet/'),
      node('Newspaper Publications', 'newspaper-publications', 'investors/notice-and-disclosures/newspaper-publications/'),
      node('Secretarial Compliance Report', 'secretarial-compliance-report', 'investors/notice-and-disclosures/secretarial-compliance-report/'),
    ]),
    node('Other Information', 'other-information', 'investors/other-information/', [
      node('EHS Documents', 'ehs-documents', 'investors/other-information/ehs-documents/'),
      node('Other Information', 'other-information', 'investors/other-information/other-information/'),
    ]),
  ]),
  node('Media, News & Press', 'media', 'media/', [
    node('News', 'news', 'media/news/'),
    node('Press Releases', 'press-releases', 'media/press-releases/'),
    node('Corporate Announcements', 'corporate-announcements', 'media/corporate-announcements/'),
  ]),
  node('Sustainability & EHS', 'sustainability', 'sustainability/', [
    node('Sustainability Policies', 'policies', 'sustainability/policies/'),
    node('Reports & Disclosures', 'reports-and-disclosures', 'sustainability/reports-and-disclosures/'),
    node('Assurance Documents', 'assurance-and-verification', 'sustainability/assurance-and-verification/'),
    node('Commitments & Ratings', 'commitments-memberships-and-ratings', 'sustainability/commitments-memberships-and-ratings/', [
      node('Commitments', 'commitments', 'sustainability/commitments-memberships-and-ratings/commitments/'),
      node('Ratings', 'ratings', 'sustainability/commitments-memberships-and-ratings/ratings/'),
    ]),
    node('Certifications', 'certifications', 'sustainability/certifications/'),
  ]),
  {
    name: 'Website',
    slug: 'website',
    children: [
      { name: 'Pages', slug: 'pages', route: '/pages', children: [], seeded: true },
      node('CSR', 'csr', 'csr/'),
      node('Corporate Policies', 'policies', 'policies/'),
      node('Products', 'products', 'products/'),
    ],
    seeded: true,
  },
]

function indexNodes(nodes, map) {
  for (const item of nodes) {
    if (item.prefix) map.set(item.prefix, item)
    indexNodes(item.children || [], map)
  }
}

function ensureDirectory(tree, map, dirPrefix) {
  if (!dirPrefix || map.has(dirPrefix)) return
  const parts = dirPrefix.split('/').filter(Boolean)
  let ancestor = null
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const prefix = `${parts.slice(0, index).join('/')}/`
    if (map.has(prefix)) {
      ancestor = map.get(prefix)
      break
    }
  }
  const start = ancestor ? ancestor.prefix.split('/').filter(Boolean).length : 0
  let siblings = ancestor ? ancestor.children : tree
  let built = ancestor ? ancestor.prefix : ''
  for (let index = start; index < parts.length; index += 1) {
    built += `${parts[index]}/`
    let child = siblings.find((item) => item.prefix === built)
    if (!child) {
      child = { name: humanize(parts[index]), slug: parts[index], prefix: built, children: [] }
      siblings.push(child)
      map.set(built, child)
    }
    siblings = child.children
  }
}

function sortNodes(nodes) {
  nodes.sort((a, b) => {
    if (a.seeded && !b.seeded) return -1
    if (!a.seeded && b.seeded) return 1
    if (a.seeded && b.seeded) return 0
    return a.name.localeCompare(b.name)
  })
  nodes.forEach((item) => sortNodes(item.children || []))
}

function annotate(nodes, records, pageCount) {
  for (const item of nodes) {
    annotate(item.children || [], records, pageCount)
    if (item.route === '/pages') item.count = pageCount
    else if (item.prefix) item.count = records.filter((record) => record.folderPrefix?.startsWith(item.prefix)).length
    else item.count = (item.children || []).filter((child) => !child.route).reduce((sum, child) => sum + (child.count || 0), 0)
  }
}

export function findByPrefix(nodes, prefix) {
  for (const item of nodes) {
    if (item.prefix === prefix) return item
    const found = findByPrefix(item.children || [], prefix)
    if (found) return found
  }
  return null
}

export function buildNavigation(records, extraCategories, pageCount) {
  const tree = structuredClone(SEED)
  const map = new Map()
  indexNodes(tree, map)
  for (const category of extraCategories) {
    if (!category?.prefix || map.has(category.prefix)) continue
    const parent = category.parentPrefix ? map.get(category.parentPrefix) : null
    if (category.parentPrefix && !parent) continue
    const created = {
      name: category.name,
      slug: category.slug,
      prefix: category.prefix,
      children: [],
      seeded: true,
    }
    ;(parent ? parent.children : tree).push(created)
    map.set(created.prefix, created)
  }
  for (const record of records) {
    if (record.folderPrefix) ensureDirectory(tree, map, record.folderPrefix)
  }
  sortNodes(tree)
  annotate(tree, records, pageCount)
  return tree
}
