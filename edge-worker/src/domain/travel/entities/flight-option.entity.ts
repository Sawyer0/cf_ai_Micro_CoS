/**
 * FlightOption - Individual flight search result
 * 
 * Entity in Travel Bounded Context
 */

import { AirportCode } from '../value-objects/airport-code.vo';

export interface FlightSegment {
    origin: AirportCode;
    destination: AirportCode;
    departureTime: Date;
    arrivalTime: Date;
    airline: string;
    flightNumber: string;
}

export class FlightOption {
    readonly id: string;
    readonly segments: FlightSegment[];
    readonly totalPrice: number;
    readonly currency: string;
    readonly bookingUrl?: string;

    private constructor(
        id: string,
        segments: FlightSegment[],
        totalPrice: number,
        currency: string,
        bookingUrl?: string
    ) {
        if (segments.length === 0) {
            throw new Error('FlightOption must have at least one segment');
        }
        if (totalPrice < 0) {
            throw new Error('Flight price cannot be negative');
        }

        this.id = id;
        this.segments = segments;
        this.totalPrice = totalPrice;
        this.currency = currency;
        this.bookingUrl = bookingUrl;
    }

    static create(
        segments: FlightSegment[],
        totalPrice: number,
        currency: string,
        bookingUrl?: string
    ): FlightOption {
        return new FlightOption(
            crypto.randomUUID(),
            segments,
            totalPrice,
            currency,
            bookingUrl
        );
    }

    static reconstitute(
        id: string,
        segments: FlightSegment[],
        totalPrice: number,
        currency: string,
        bookingUrl?: string
    ): FlightOption {
        return new FlightOption(id, segments, totalPrice, currency, bookingUrl);
    }

    isDirect(): boolean {
        return this.segments.length === 1;
    }

    totalDurationMs(): number {
        const firstDeparture = this.segments[0].departureTime;
        const lastArrival = this.segments[this.segments.length - 1].arrivalTime;
        return lastArrival.getTime() - firstDeparture.getTime();
    }
}
