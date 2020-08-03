/* global module */

/* Magic Mirror
 * Node Helper: MMM-BilbaoTramTime
 *
 * By Pablo Operé
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
const request = require('request');
const moment = require('moment');
const fs = require('fs');
const unzip = require('./node_modules/unzipper/unzip');
const csv = require('./node_modules/csv-parser/index');

let data = {
	agency: [],
	calendar: [],
	routes: [],
	stopTimes: [],
	stops: [],
	trips: []
};

const cuandoLlegaAPI = 'https://ws.rosario.gob.ar/ubicaciones/public/cuandollega';


const tranviaZipUrl = 'https://gtfs.euskotren.eus/Euskotren_gtfs.zip';
const moduleFolder = 'modules/MMM-BilbaoTramTime';

const zipFile = `${moduleFolder}/Euskotren_gtfs.zip`;
const dataFolder = `${moduleFolder}/data`;

const agencyFile = `${moduleFolder}/data/agency.txt`;
const calendarFile = `${moduleFolder}/data/calendar.txt`;
const routesFile = `${moduleFolder}/data/routes.txt`;
const stopTimesFile = `${moduleFolder}/data/stop_times.txt`;
const stopsFile = `${moduleFolder}/data/stops.txt`;
const tripsFile = `${moduleFolder}/data/trips.txt`;

const dataFiles = [
	{
		filePath: agencyFile,
		dataProp: 'agency'
	},
	{
		filePath: calendarFile,
		dataProp: 'calendar'
	},
	{
		filePath: routesFile,
		dataProp: 'routes'
	},
	{
		filePath: stopTimesFile,
		dataProp: 'stopTimes'
	},
	{
		filePath: stopsFile,
		dataProp: 'stops'
	},
	{
		filePath: tripsFile,
		dataProp: 'trips'
	}
];


module.exports = NodeHelper.create({
	start: function () {
		console.log('Starting node helper for: ' + this.name);

		request(tranviaZipUrl)
			.pipe(fs.createWriteStream(zipFile))
			.on('close', () => {
				console.log('Success saved downloaded ZIP file!');
				var readStream = fs.createReadStream(zipFile);
				readStream
					.pipe(unzip.Extract({path: dataFolder}))
					.on('close', () => {
						console.log('Success unzipped data files!');
						for (let dataFile of dataFiles) {
							fs.createReadStream(dataFile.filePath)
								.pipe(csv())
								.on('data', (content) => data[dataFile.dataProp].push(content))
								.on('end', () => {
									fs.writeFileSync(`${moduleFolder}/data/${dataFile.dataProp}.json`, JSON.stringify(data[dataFile.dataProp], null, 4));
									if (dataFile.dataProp == dataFiles[dataFiles.length - 1].dataProp) {
										console.log('Succesfully parsed csv files into json');
									}
								});
						}

					});
			})

	},
	getBusInfo: function (info) {
		var self = this
		var options = {
			method: 'GET',
			qs: {
				linea: info.line,
				parada: info.stop
			},
			url: cuandoLlegaAPI
		}
		request(options, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var result = JSON.parse(body)
				self.sendSocketNotification('BUS_RESULT', result)
			}
		})
	},
	getTripMoment: function (stopTime) {
		const trip = data.trips.find((t) => t.trip_id == stopTime.trip_id);
		const tripCalendar = data.calendar.find((calendar) => calendar.service_id == trip.service_id);
		const tripMoment = moment(`${tripCalendar.start_date} ${stopTime.arrival_time}`, 'YYYYMMDD HH:mm:ss');
		return tripMoment;
	},
	getTransportInfo: function (info) {
		if (!info || !info.line || !info.stop) {
			console.error('getTransportInfo need info with line and stop properties');
			return;
		}
		console.log('getTransportInfo info' ,info);
		const self = this;
		let result = {
				arrivals: [],
				stop: undefined,
				route: undefined
		};
		result.route = data.routes.find((r) => r.route_short_name == info.line );
		result.stop = data.stops.find((s) => s.stop_id == info.stop);

		if (result.route && result.stop) {
			const futureStopTimes = data.stopTimes.filter((stopTime) => {
				//it is a stoptime from the same stop
				if (stopTime.stop_id == result.stop.stop_id) {
					const tripMoment = self.getTripMoment(stopTime);
					return moment().isBefore(tripMoment);
				} else {
					return false;
				}
			});
			console.log('futureStopTimes' ,futureStopTimes.length);
			const orderedNextStopTimes = futureStopTimes.sort((stopTimeA, stopTimeB) => {
				const tripMomentA = self.getTripMoment(stopTimeA);
				const tripMomentB = self.getTripMoment(stopTimeB);
				return tripMomentA.isBefore(tripMomentB) ? -1 : 1;
			})

			result.arrivals = orderedNextStopTimes.slice(0,4).map((stopTime) => {
				const trip = data.trips.find((t) => t.trip_id == stopTime.trip_id);
				const calendar = data.calendar.find((c) => c.service_id == trip.service_id);
				return {
					stopTime,
					trip,
					calendar
				};
			});
			console.log('result' ,JSON.stringify(result, null, 4));

			self.sendSocketNotification('TRANSPORT_RESULT', result);



		}









	},
	socketNotificationReceived: function (notification, payload) {
		/*if (notification === 'GET_INFO') {
			this.getBusInfo(payload);
		}*/
		if (notification === 'GET_TRANSPORT_INFO') {
			console.log('GET_TRANSPORT_INFO' );
			this.getTransportInfo(payload);
		}
	}

});
