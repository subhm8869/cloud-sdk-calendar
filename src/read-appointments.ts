/* eslint-disable unused-imports/no-unused-imports-ts */
/* eslint-disable @typescript-eslint/no-unused-vars */
import moment from 'moment';
// import {
//   TimeSheetEntry,
//   workforceTimesheetService
// } from './generated/workforce-timesheet-service';
import {
  EmployeeTime,
  ecTimeOffService
} from './generated/ec-time-off-service';
import { Appointment } from './model/appointment';
import { Person } from './model/person';
import { readPersons } from './read-persons';
import {
  transformSfsfAppointment
} from './util/appointment-transformation';

export async function readAppointments(
  year: number,
  srv: any,
  // readS4AppointmentsByPersonFn = readS4AppointmentsByPerson,
  readSfsfAppointmentsByPersonFn = readSfsfAppointmentsByPerson
): Promise<[{ year: number; appointments: Appointment[] }]> {
  return readPersons(srv)
    .then(persons =>
      Promise.all([
        readLocalAppointments(srv),
        readRemoteAppointments(
          readSfsfAppointmentsByPersonFn,
          transformSfsfAppointment
        )(persons, year)
      ])
    )
    .then(([localAppointments, sfsfAppointments]) => [
      {
        year,
        appointments: [
          ...localAppointments,
          ...sfsfAppointments
        ]
      }
    ]);
}

// export async function readS4AppointmentsByPerson(
//   person: Person,
//   year: number
// ): Promise<TimeSheetEntry[]> {
//   const personId = person.s4ID;
//   const from = moment.utc(`${year}-01-01`);
//   const to = moment.utc(`${year}-12-31`);

//   // TODO: Retrieve TimeSheetEntries from SAP S/4HANA here. Use the above variables for filtering.
//   return [];
// }

export async function readSfsfAppointmentsByPerson(
  person: Person,
  year: number
): Promise<EmployeeTime[]> {
  const timeType = 'VACATION';
  const personId = person.sfsfID;
  const from = moment.utc(`${year}-01-01`);
  const to = moment.utc(`${year}-12-31`);

    const { employeeTimeApi } = ecTimeOffService();
  return employeeTimeApi
    .requestBuilder()
    .getAll()
    .select(
      employeeTimeApi.schema.EXTERNAL_CODE,
      employeeTimeApi.schema.START_TIME,
      employeeTimeApi.schema.START_DATE,
      employeeTimeApi.schema.END_TIME,
      employeeTimeApi.schema.END_DATE,
      employeeTimeApi.schema.APPROVAL_STATUS,
      employeeTimeApi.schema.USER_ID
    )
    .filter(
      employeeTimeApi.schema.TIME_TYPE.equals(timeType),
      employeeTimeApi.schema.USER_ID.equals(personId),
      employeeTimeApi.schema.START_DATE.greaterOrEqual(from),
      employeeTimeApi.schema.END_DATE.lessOrEqual(to)
    )
    .execute({ destinationName: 'SFSF' });

  // TODO: Retrieve EmployeeTime from SAP SuccessFactors here. Use the above variables for filtering.
  return [];
}

export async function readLocalAppointments(srv: any): Promise<Appointment[]> {
  return srv
    .read('Appointment')
    .then((appointments: Appointment[]) =>
      appointments.filter(appointment => appointment.status !== 'APPROVED')
    );
}

function readRemoteAppointments<T>(
  readFn: (person: Person, year: number) => Promise<T[]>,
  transformFn: (appointment: T, person: Person, year: number) => Appointment
): (persons: Person[], year: number) => Promise<Appointment[]> {
  return (persons: Person[], year: number) =>
    Promise.all(
      persons.map(person =>
        readFn(person, year).then((appointments: T[]) =>
          appointments.map(appointment =>
            transformFn(appointment, person, year)
          )
        )
      )
    ).then((appointmentsByPerson: Appointment[][]) =>
      appointmentsByPerson.reduce(
        (allAppointments, appointmentsForOnePerson) => [
          ...allAppointments,
          ...appointmentsForOnePerson
        ],
        []
      )
    );
}
