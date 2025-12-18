const API_KEY = process.env.SMARTSUITE_API_KEY || ''
const WORKSPACE_ID = 'sba974gi'
const BASE_URL = 'https://app.smartsuite.com/api/v1/applications'

const TABLES = {
  modules: '69441e0e081da2e01f4d9a78',
  workers: '69441f0deb5683351ec55a8f',
  verifications: '69441fd3d9350cee4e1b8e3e',
  audit_logs: '694440eb0dc34459d50511cd'
}

async function request(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`
  console.log('SmartSuite request:', url)
  
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Token ${API_KEY}`,
      'Account-Id': WORKSPACE_ID,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!res.ok) {
    const error = await res.text()
    console.log('SmartSuite error response:', error)
    throw new Error(`SmartSuite API error: ${res.status} ${error}`)
  }

  return res.json()
}

export async function getRecords(table: keyof typeof TABLES) {
  return request(`/${TABLES[table]}/records/list/`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export async function getRecord(table: keyof typeof TABLES, id: string) {
  return request(`/${TABLES[table]}/records/${id}/`)
}

export async function createRecord(table: keyof typeof TABLES, data: Record<string, unknown>) {
  return request(`/${TABLES[table]}/records/`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function updateRecord(table: keyof typeof TABLES, id: string, data: Record<string, unknown>) {
  return request(`/${TABLES[table]}/records/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}

export async function deleteRecord(table: keyof typeof TABLES, id: string) {
  return request(`/${TABLES[table]}/records/${id}/`, {
    method: 'DELETE'
  })
}

export { TABLES }
