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

let dataSource = {
	agency: [],
	calendar: [],
	routes: [],
	stopTimes: [],
	stops: [],
	trips: []
};
let data = undefined;

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

let isLoadingDataSource = false;
let isLoadingData = false;
let isFirstLoad = true;


module.exports = NodeHelper.create({
	start: function () {
		console.log('Starting node helper for: ' + this.name);

		this.loadDataSource();
		//this.loadDataFromLocal();

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
	getTripMoment: function (stopTime, info) {
		const idStopLine = `${info.line}-${info.stop}`;
		const trip = data[idStopLine].trips.find((t) => t.trip_id == stopTime.trip_id);
		const tripCalendar = data[idStopLine].calendar.find((calendar) => calendar.service_id == trip.service_id);
		return moment(`${tripCalendar.start_date} ${stopTime.arrival_time}`, 'YYYYMMDD HH:mm:ss');
	},
	getTransportInfo: function (info) {
		if (!info || !info.line || !info.stop) {
			console.error('getTransportInfo need info with line and stop properties');
			return;
		}
		if (isLoadingDataSource || isLoadingData) {
			console.error('data was not loaded by now');
			return;
		}
		if (!dataSource || !dataSource.routes || !dataSource.routes.length || dataSource.routes.length == 0) {
			this.loadDataSourceFromSource()
			return;
		}
		console.log('getTransportInfo info' ,info);
		const self = this;
		let result = {
				arrivals: [],
				stop: undefined,
				route: undefined
		};
		if (!data) {
			data = {};
		}
		const idStopLine = `${info.line}-${info.stop}`;
		if (!data[idStopLine]) {
			data[idStopLine] = { ...dataSource};
		}


		data[idStopLine].route = data[idStopLine].route ? data[idStopLine].route : data[idStopLine].routes.find((r) => r.route_short_name == info.line );
		data[idStopLine].stop = data[idStopLine].stop ? data[idStopLine].stop : data[idStopLine].stops.find((s) => s.stop_id == info.stop);
		result.route = data[idStopLine].route ;
		result.stop = data[idStopLine].stop;




		if (result.route && result.stop) {

			data[idStopLine].stopTimes = data[idStopLine].stopTimes.filter((stopTime) => {
				//it is a stoptime from the same stop
				if (stopTime.stop_id == result.stop.stop_id) {
					const tripMoment = self.getTripMoment(stopTime, info);
					return moment().isBefore(tripMoment);
				} else {
					return false;
				}
			});
			if (data[idStopLine].stopTimes.length == 0) {
				this.loadDataSourceFromSource();
				return;
			}
			console.log('futureStopTimes' ,data[idStopLine].stopTimes.length);
			data[idStopLine].stopTimes = data[idStopLine].stopTimes.sort((stopTimeA, stopTimeB) => {
				const tripMomentA = self.getTripMoment(stopTimeA, info);
				const tripMomentB = self.getTripMoment(stopTimeB, info);
				return tripMomentA.isBefore(tripMomentB) ? -1 : 1;
			})

			result.arrivals = data[idStopLine].stopTimes.slice(0,4).map((stopTime) => {
				const trip = data[idStopLine].trips.find((t) => t.trip_id == stopTime.trip_id);
				const calendar = data[idStopLine].calendar.find((c) => c.service_id == trip.service_id);
				return {
					stopTime,
					trip,
					calendar
				};
			});

			//this.storeDataInLocal();
			console.log('result' ,JSON.stringify(result, null, 1));

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
	},
	loadDataSourceFromSource: function () {
		isLoadingDataSource = true;
		console.log('Loading new data from source')
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
								.on('data', (content) => dataSource[dataFile.dataProp].push(content))
								.on('end', () => {
									if (dataFile.dataProp == dataFiles[dataFiles.length - 1].dataProp) {
										this.storeDataSourceInLocal();
										//reinicializar los datos
										data = undefined;
										console.log('Succesfully parsed csv files into json');
										isLoadingDataSource = false;
									}
								});
						}

					});
			})
	},
	storeDataSourceInLocal: function () {
		fs.writeFileSync(`${moduleFolder}/data/dataSource.json`, JSON.stringify(dataSource));
	},
	loadDataSource: function () {
		isLoadingDataSource = true;
		fs.readFile(`${moduleFolder}/data/dataSource.json`, (err, rawData) => {
			if (err) {
				console.log('DataSource not found in local folder');
				console.log('Starting loading dataSource from source');
				this.loadDataSourceFromSource();
			} else {
				console.log('DataSource read from local');
				dataSource = JSON.parse(rawData);
				//reinicializar los datos
				if (!isLoadingData && !isFirstLoad) {
					data = undefined;
				}
				isFirstLoad = false;
				isLoadingDataSource = false;
			}
		});
	},
	storeDataInLocal: function () {
		fs.writeFileSync(`${moduleFolder}/data/data.json`, JSON.stringify(data));
		//console.log('data stored:', data);
	},
	loadDataFromLocal: function () {
		isLoadingData = true;
		fs.readFile(`${moduleFolder}/data/data.json`, (err, rawData) => {
			if (err) {
				console.log('Data not found in local folder');
				console.log('Starting loading dataSource from source');
				data = undefined;
				isLoadingData = false;
			} else {
				data = JSON.parse(rawData);
				//console.log('data read:', data);
				this.storeDataInLocal();
				isLoadingData = false;
			}
		});
	}

});
