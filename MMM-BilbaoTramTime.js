/* global Module */

/* Magic Mirror
 * Module: MMM-BilbaoTramTime
 *
 * By Pablo Operé
 * MIT Licensed.
 */

Module.register('MMM-BilbaoTramTime', {
	busesInfo: [],
	transportInfo: [],
	defaults: {
		header: 'Tiempo para próximo tranvía',
		transport: [
			{
				line: 'TR',
				stop: 14720
			}
		],

		buses: [
			{
				line: '120', // 120 Único
				stop: 8317
			},
			{
				line: '153 N', // 153 Negra
				stop: 4146
			},
			{
				line: '153 R', // 153 Roja
				stop: 4146
			}
		],
		mmLocation: [43.263242, -2.9367951], // [ latitude, longitude ]
		updateInterval: 30000, // update interval in milliseconds
		fadeSpeed: 4000,
		infoClass: 'big' // small, medium or big
	},

	getStyles: function () {
		return ['MMM-BilbaoTramTime.css']
	},
	start: function () {
		Log.info('Starting module: ' + this.name);

		this.config.buses.forEach(info => {
			this.getBusInfo(info)
		})

		this.config.transport.forEach(info => this.getTransportInfo(info));

		moment.updateLocale('en', {
			relativeTime : {
				future: "%s",
				past:   "hace %s",
				s  : 'pocos seg',
				ss : '%d seg',
				m:  "1 min",
				mm: "%d mins",
				h:  "1 h",
				hh: "%d h",
				d:  "1 día",
				dd: "%d días",
				w:  "1 sem",
				ww: "%d sem",
				M:  "1 mes",
				MM: "%d meses",
				y:  "1 año",
				yy: "%d años"
			}
		});

		this.scheduleUpdate()
	},
	// https://docs.magicmirror.builders/development/core-module-file.html#suspend
	// used in combination with ModuleScheduler in order to halt the timers
	suspend: function () {
		window.clearInterval(this.intervalID)
	},

	resume: function () {
		this.scheduleUpdate()
	},

	scheduleUpdate: function (delay) {
		var nextLoad = this.config.updateInterval
		if (typeof delay !== 'undefined' && delay >= 0) {
			nextLoad = delay
		}
		var self = this
		this.intervalID = setInterval(function () {
			self.busesInfo = [] // prevent redrawing twice the same info
			self.config.buses.forEach(info => {
				self.getBusInfo(info)
			});
			self.transportInfo = [] // prevent redrawing twice the same info
			self.config.transport.forEach(info => self.getTransportInfo(info));
		}, nextLoad)
	},

	getBusInfo: function (info) {
		this.sendSocketNotification('GET_INFO', info)
	},
	getTransportInfo: function (info) {
		console.log('getTransportInfo info' ,info);
		this.sendSocketNotification('GET_TRANSPORT_INFO', info)
	},

	socketNotificationReceived: function (notification, payload) {
		var self = this
		/*if (notification === 'BUS_RESULT') {
			if (payload.length !== 0) { // update DOM only if it's needed
				this.busesInfo.push(payload)
				this.updateDom(self.config.fadeSpeed)
			}
		}*/
		if (notification === 'TRANSPORT_RESULT') {
			if (payload) { // update DOM only if it's needed
				this.transportInfo.push(payload);
				this.updateDom(self.config.fadeSpeed);
			}
		}
	},

	getHeader: function () {
		return this.config.header
	},

	getScripts: function() {
		return ['moment.js'];
	},

	getDom: function () {
		var wrapper = document.createElement('table')
		if (Object.entries(this.transportInfo).length === 0) return wrapper

		/*var busList = this.config.buses
		var busesInformation = this.busesInfo*/


		const transportList = this.config.buses;
		const transportInformation = this.transportInfo;

		/*wrapper.className = 'cuandollega ' + this.config.infoClass*/

		var self = this
/*		this.busesInfo.forEach(bus => {
			let nearBuses = bus[0].arribos
			let lineInfo = bus[0].linea

			let first = true
			for (let key in nearBuses) {
				let value = nearBuses[key]

				let busRow = document.createElement('tr'),
					busSymbolCell = document.createElement('td'),
					busLineCell = document.createElement('td'),
					busDistanceCell = document.createElement('td'),
					busMinutesCell = document.createElement('td');

				if (nearBuses.length == 1) busRow.className = 'last' // some lines could have only 1 arrival time
				else busRow.className = first ? '' : 'last'
				busSymbolCell.innerHTML = first ? '<i class='fas fa-tram'></i>' : ''
				busSymbolCell.className = 'bus-symbol'
				busLineCell.innerHTML = first ? lineInfo['nombreCorto'] : ''
				busLineCell.className = 'bus-line'
				busDistanceCell.innerHTML = self.distanceToMM(value['latitud'], value['longitud'])
				busDistanceCell.className = 'bus-distance number'
				busMinutesCell.innerHTML = value['arriboEnMinutos'] + ' min'
				let proximityClass = ''
				if (value['arriboEnMinutos'] <= 3) {
					proximityClass = 'arriving'
				} else if (value['arriboEnMinutos'] > 3 && value['arriboEnMinutos'] <= 5) {
					proximityClass = 'close'
				} else proximityClass = 'faraway'

				busMinutesCell.className = proximityClass + ' number'

				busRow.appendChild(busSymbolCell)
				busRow.appendChild(busLineCell)
				busRow.appendChild(busDistanceCell)
				busRow.appendChild(busMinutesCell)

				wrapper.appendChild(busRow)

				first = false
			}
		})*/

		this.transportInfo.forEach(transport => {
			let arrivals = transport.arrivals;
			let lineInfo = transport.route;
			let stop = transport.stop;

			let first = true
			for (let arrival of arrivals) {

				let busRow = document.createElement('tr'),
					busSymbolCell = document.createElement('td'),
					busLineCell = document.createElement('td'),
					busDistanceCell = document.createElement('td'),
					busMinutesCell = document.createElement('td');

				if (arrivals.length == 1) busRow.className = 'last' // some lines could have only 1 arrival time
				else busRow.className = first ? '' : 'last'
				busSymbolCell.innerHTML = first ? '<i class="fas fa-tram"></i>' : ''
				busSymbolCell.className = 'bus-symbol'
				busLineCell.innerHTML = first ? lineInfo['route_short_name'] : ''
				busLineCell.className = 'bus-line'
				busDistanceCell.innerHTML = self.distanceToMM(stop.stop_lat, stop.stop_lon)
				busDistanceCell.className = 'bus-distance number'
				busMinutesCell.innerHTML = self.timeToArrive(arrival);
				let proximityClass = 'close'
				/*if (self.timeToArrive(arrival) <= 3) {
					proximityClass = 'arriving'
				} else if (self.timeToArrive(arrival) > 3 && self.timeToArrive(arrival) <= 5) {
					proximityClass = 'close'
				} else proximityClass = 'faraway'*/

				busMinutesCell.className = proximityClass + ' number'

				busRow.appendChild(busSymbolCell)
				busRow.appendChild(busLineCell)
				busRow.appendChild(busDistanceCell)
				busRow.appendChild(busMinutesCell)

				wrapper.appendChild(busRow)

				first = false
			}
		})

		return wrapper
	},
	// time to arrive
	timeToArrive: function (arrival) {
		return moment(`${arrival.calendar.start_date} ${arrival.stopTime.arrival_time}`, 'YYYYMMDD HH:mm:ss').fromNow();
	},
	// distance from the upcoming bus to where my MagicMirror is located
	distanceToMM: function (lat2, lon2) {
		lat1 = this.config.mmLocation[0]
		lon1 = this.config.mmLocation[1]

		var R = 6371; // km (change this constant to get miles)
		var dLat = (lat2 - lat1) * Math.PI / 180;
		var dLon = (lon2 - lon1) * Math.PI / 180;
		var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
			Math.sin(dLon / 2) * Math.sin(dLon / 2);
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		var d = R * c;
		if (d > 1) return Math.round(d) + 'km';
		else if (d <= 1) return Math.round(d * 1000) + 'm';
		return d;
	}

})
