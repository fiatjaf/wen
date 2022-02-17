import browser from 'webextension-polyfill'
import {relayPool} from 'nostr-tools'

import {normalizeURL} from './common'

const NOSTR_EXTENSION_ID = 'bkdhadcilfgcahjkeociamehbfgjijao'

let pool
const urlEvents = {}
const urlDispatchers = {}

async function initNostr() {
  const pool = relayPool()

  pool.onNotice((notice, relay) => {
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/48x48.png'),
      title: `relay ${relay.url} says:`,
      message: `${notice}`
    })
  })

  try {
    let response = await browser.runtime.sendMessage(
      NOSTR_EXTENSION_ID,
      {type: 'getRelays', params: {}},
      {}
    )

    if (response.error) {
      throw new Error(response.error)
    }

    if (Object.keys(response).length === 0) {
      throw new Error('no relays registered in nostr extension')
    }

    for (let url in response) {
      pool.addRelay(url, response[url])
    }
  } catch (error) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/48x48.png'),
      title: 'failed to get relays from nostr extension.',
      message: error.message
    })
  }

  return pool
}

browser.runtime.onMessage.addListener(
  async ({type, event, url, tabId}, sender) => {
    pool = pool || (await initNostr())

    switch (type) {
      case 'read': {
        if (url in urlEvents) {
          return urlEvents[url]
        } else {
          const events = {}
          urlEvents[url] = events
          urlDispatchers[url] = events =>
            browser.runtime.sendMessage({
              type: 'events',
              url,
              events
            })
          fetchEvents(url, tabId, events)
          return {}
        }
      }
      case 'publish': {
        try {
          let response = await browser.runtime.sendMessage(
            NOSTR_EXTENSION_ID,
            {
              type: 'signEvent',
              params: {
                event
              }
            },
            {}
          )
          if (response.error) {
            throw new Error(response.error)
          }

          event = response
        } catch (error) {
          browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/48x48.png'),
            title: `failed to sign event ${event.id.slice(0, 5)}…`,
            message: error.message
          })
          return
        }

        let publishTimeout = setTimeout(() => {
          browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/48x48.png'),
            title: 'event failed to publish',
            message: `we didn't get a confirmation of event ${event.id.slice(
              0,
              5
            )}… being published in any relay. there was probably an error somewhere.`
          })
        }, 4000)

        pool.publish(event, (status, relay) => {
          switch (status) {
            case -1:
              console.warn(
                `failed to send ${JSON.stringify(event)} to ${relay}`
              )
              break
            case 1:
              clearTimeout(publishTimeout)

              browser.notifications.create({
                type: 'basic',
                iconUrl: browser.runtime.getURL('icons/48x48.png'),
                title: 'event published',
                message: `event ${event.id.slice(0, 5)}… seen on ${relay}.`
              })
              break
          }
        })
        break
      }
    }
  }
)

browser.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (!tab.url.startsWith('https://')) return

  if (change.status === 'complete') {
    let url = normalizeURL(tab.url)

    const events = {}
    urlEvents[url] = events
    fetchEvents(url, tabId, events)
  }
})

async function fetchEvents(url, tabId, events) {
  pool = pool || (await initNostr())
  pool.sub({
    filter: {'#r': [url]},
    cb: event => {
      if (event.id in events) return
      events[event.id] = event

      browser.action.setBadgeText({
        text: `${Object.keys(events).length}`,
        tabId
      })

      urlDispatchers[url]?.(events)
    }
  })
}
