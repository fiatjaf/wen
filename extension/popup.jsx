import browser from 'webextension-polyfill'
import {render} from 'react-dom'
import React, {useState, useEffect} from 'react'
import useComputedState from 'use-computed-state'

import {normalizeURL} from './common'

function Popup() {
  let [comment, setComment] = useState('')
  let [events, setEvents] = useState({})
  let [tab, setTab] = useState(null)

  useEffect(() => {
    ;(async () => {
      let [tab] = await browser.tabs.query({active: true, currentWindow: true})
      setTab(tab)

      let url = normalizeURL(tab.url)

      let events = await browser.runtime.sendMessage({
        type: 'read',
        url,
        tabId: tab.id
      })
      setEvents(events)

      browser.runtime.onMessage.addListener(message => {
        if (message.url !== url) return

        switch (message.type) {
          case 'events':
            setEvents(message.events)
            break
        }
      })
    })()
  }, [])

  let orderedEvents = useComputedState(
    () => Object.values(events).sort((a, b) => a.created_at - b.created_at),
    [events]
  )

  if (!tab) return '...'

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          padding: '4px',
          margin: '6px',
          border: '1px solid orange'
        }}
      >
        <span style={{textAlign: 'right'}}>
          comment about <em style={{color: 'blue'}}>{normalizeURL(tab.url)}</em>
        </span>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          autoFocus
          style={{border: 'none', outline: 'none', width: '200px'}}
        />
        <button style={{margin: '4px 0 4px'}} onClick={publishEvent}>
          post comment
        </button>
      </div>
      <div>
        {orderedEvents.map(evt => (
          <div
            key={evt.id}
            style={{
              padding: '8px',
              margin: '6px',
              border: '1px solid silver'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '90%',
                fontFamily: 'monospace'
              }}
            >
              <div>
                from{' '}
                <a
                  href={`web+nostr:${evt.pubkey}`}
                  title={evt.pubkey}
                  target="_blank"
                  style={{color: 'blue'}}
                >
                  {evt.pubkey.slice(0, 5)}…
                </a>
              </div>
              <div>
                <a
                  href={`web+nostr:event:${evt.id}`}
                  title={evt.id}
                  target="_blank"
                  style={{color: 'gray'}}
                >
                  {new Date(evt.created_at * 1000).toISOString().split('T')[0]}
                </a>
              </div>
            </div>
            <div style={{fontSize: '110%'}}>{evt.content}</div>
          </div>
        ))}
      </div>
    </div>
  )

  async function publishEvent(ev) {
    ev.preventDefault()

    browser.runtime.sendMessage({
      type: 'publish',
      event: {
        created_at: Math.round(Date.now() / 1000),
        kind: 34,
        tags: [['r', normalizeURL(tab.pendingUrl || tab.url)]],
        content: comment
      }
    })

    setComment('')
  }
}

render(<Popup />, document.getElementById('main'))
