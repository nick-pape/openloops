import ICAL from 'ical.js'

export interface ParsedEvent {
  uid: string
  title: string
  startDt: Date
  endDt: Date
  raw: any
}

export function parseICSFile(icsContent: string): ParsedEvent[] {
  const events: ParsedEvent[] = []

  try {
    const jcalData = ICAL.parse(icsContent)
    const comp = new ICAL.Component(jcalData)
    const vevents = comp.getAllSubcomponents('vevent')

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent)

      const uid = event.uid || `generated-${Date.now()}-${Math.random()}`
      const title = event.summary || 'Untitled Event'
      const startDt = event.startDate?.toJSDate() || new Date()
      const endDt = event.endDate?.toJSDate() || new Date(startDt.getTime() + 60 * 60 * 1000) // Default 1 hour

      events.push({
        uid,
        title,
        startDt,
        endDt,
        raw: vevent.toJSON()
      })
    }
  } catch (error: any) {
    throw new Error(`Failed to parse ICS: ${error.message}`)
  }

  return events
}
