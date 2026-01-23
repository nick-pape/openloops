declare module 'ical.js' {
  export function parse(input: string): any

  export class Component {
    constructor(jCal: any)
    getAllSubcomponents(name: string): Component[]
    toJSON(): any
  }

  export class Event {
    constructor(component: Component)
    uid: string
    summary: string
    startDate: Time | null
    endDate: Time | null
  }

  export class Time {
    toJSDate(): Date
  }
}
