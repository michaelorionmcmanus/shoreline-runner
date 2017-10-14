import test from 'ava'
import { run } from './handler'

const testUrl = 'https://google.com'
const testEvent = {
  url: testUrl,
  bucket: 'perf-audit-results',
  prefix: 'ABC',
  objectKey: {},
  headers: {
    "BANANA": "PEEL"
  },
}
const testContext = {}

test('run() with captureScreenshot handler', async (t) => {
  const promise = run(
    testEvent,
    testContext,
    (error, response) => {
      t.falsy(error)
      t.truthy(response.body)
      t.is(response.statusCode, 200)
    }
  )

  t.notThrows(promise)

  await promise
})
