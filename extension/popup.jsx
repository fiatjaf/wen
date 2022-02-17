import browser from 'webextension-polyfill'
import {render} from 'react-dom'
import React, {useState, useEffect} from 'react'

import {normalizeURL} from './common'

function Popup() {
  let [comment, setComment] = useState('')
  let [events, setEvents] = useState([])

  useEffect(() => {
    loadComments()
  }, [])

  return (
    <>
      <h2>wen</h2>
      <textarea value={comment} onChange={e => setComment(e.target.value)} />
      <div>
        {events.map(evt => (
          <div>
            <div>{evt.pubkey}</div>
            <div>{evt.content}</div>
          </div>
        ))}
      </div>
      <button onClick={publishEvent}>publish</button>
    </>
  )

  async function loadComments() {
    let [tab] = await browser.tabs.query({active: true, currentWindow: true})
    let events = await browser.runtime.sendMessage({
      type: 'read',
      url: normalizeURL(tab.pendingUrl || tab.url),
      tabId: tab.id
    })
    setEvents(events)
  }

  async function publishEvent(ev) {
    ev.preventDefault()

    let [tab] = await browser.tabs.query({active: true, currentWindow: true})
    browser.runtime.sendMessage({
      type: 'publish',
      event: {
        created_at: Math.round(Date.now() / 1000),
        kind: 1,
        tags: [['r', normalizeURL(tab.pendingUrl || tab.url)]],
        content: comment
      }
    })
  }
}

render(<Popup />, document.getElementById('main'))
