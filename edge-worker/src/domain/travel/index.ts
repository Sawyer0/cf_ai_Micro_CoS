/**
 * Travel Bounded Context - Public API
 *
 * Exports aggregates, entities, value objects, events, and ports
 */

// Aggregates
export { TravelEvent, TravelEventStatus } from './aggregates/travel-event.aggregate';

// Entities
export { FlightOption, FlightSegment } from './entities/flight-option.entity';

// Value Objects
export { TravelEventId } from './value-objects/travel-event-id.vo';
export { AirportCode } from './value-objects/airport-code.vo';

// Events
export { TravelIntentDetected, FlightSearchStarted, FlightOptionsReceived, FlightSelected } from './events/travel.events';

// Ports
export { IFlightPort, FlightSearchRequest } from './ports/flight.port';
