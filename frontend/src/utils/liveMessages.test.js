/**
 * Live-change messaging rules.
 *
 * The point of these tests is restraint as much as wording: background
 * refreshes must stay silent, and only a record disappearing in another tab is
 * worth interrupting for.
 *
 * Run with:  npm test   (from the frontend folder)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  describeLiveChange,
  liveResourceLabel,
  shouldAnnounceChange,
} from './liveMessages.js'

test('describeLiveChange names the resource and the action', () => {
  assert.deepEqual(describeLiveChange({ type: 'change', resource: 'products', action: 'updated' }), {
    title: 'Products updated',
    message: 'Changed in another tab or device — this view is already up to date.',
    isDestructive: false,
  })

  assert.equal(
    describeLiveChange({ type: 'change', resource: 'bills', action: 'created' }).title,
    'Bills added',
  )
  assert.equal(
    describeLiveChange({ type: 'change', resource: 'services', action: 'deleted' }).title,
    'Service history deleted',
  )
})

test('describeLiveChange ignores non-change frames and unknown resources', () => {
  assert.equal(describeLiveChange({ type: 'resync' }), null)
  assert.equal(describeLiveChange(null), null)
  assert.equal(liveResourceLabel('mystery'), 'Your records')
  assert.equal(
    describeLiveChange({ type: 'change', resource: 'mystery', action: 'updated' }).title,
    'Your records updated',
  )
})

test('only a deletion in a visible tab raises a toast', () => {
  const deleted = { type: 'change', resource: 'products', action: 'deleted' }
  const updated = { type: 'change', resource: 'products', action: 'updated' }

  assert.equal(shouldAnnounceChange(deleted), true)
  assert.equal(shouldAnnounceChange(deleted, { visible: false }), false)
  assert.equal(shouldAnnounceChange(updated), false, 'silent refresh must stay silent')
  assert.equal(shouldAnnounceChange({ type: 'resync' }), false)
})
