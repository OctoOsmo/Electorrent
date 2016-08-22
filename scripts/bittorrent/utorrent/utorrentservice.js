'use strict';

angular.module('torrentApp')
    .service('utorrentService', ["$http", "$resource", "$log", "$q", "TorrentU", "UtorrentGUI", "notificationService", function($http, $resource, $log, $q, Torrent, uTorrentGUI, $notify) {

        //this.gui = new uTorrentGUI(this);

        var data = {
            url: null,
            username: null,
            password: null,
            token: null,
            cid: 0,
            build: -1
        };

        function build(array) {
            var torrent = Object.create(Torrent.prototype);
            torrent = (Torrent.apply(torrent, array) || torrent);
            return torrent;
        }

        var updateCidInterceptor = {
            response: function(response) {
                data.cid = response.data.torrentc;
            },
            responseError: function(response) {
                console.log('error in interceptor', data, arguments, response);
            }
        };

        function extractTokenFromHTML(str) {
            var match = str.match(/>([^<]+)</);
            if (match) {
                data.token = match[match.length - 1];
                return true;
            }
            return false;
        }

        function url(ip, port) {
            return `http://${ip}:${port}/gui/`;
        }

        function saveConnection(ip, port, username, password) {
            data.username = username;
            data.password = password;
            data.url = url(ip, port);
        }

        this.connect = function(ip, port, user, pass) {
            var loading = $q.defer();
            $log.info('get token');

            var encoded = new Buffer(`${user}:${pass}`).toString('base64');
            $http.defaults.headers.common.Authorization = 'Basic ' + encoded;

            $http.get(url(ip, port) + 'token.html?t=' + Date.now(), {
                timeout: 5000
            }).success(function(str) {
                if (extractTokenFromHTML(str)) {
                    saveConnection(ip, port, user, pass);
                    loading.resolve(data.token);
                } else {
                    loading.reject('Could not find token');
                }
            }).error(function(err, status) {
                $notify.alertAuth(err, status);
                loading.reject(err || 'Error loading token', status);
            });

            return loading.promise;
        }

        this.addTorrentUrl = function(url, dir, path) {
            return $resource(data.url + '.' + '?token=:token&action=add-url&s=:url&download_dir=:dir&path=:path&t=:t', {
                token: data.token,
                t: Date.now(),
                url: url,
                dir: dir,
                path: path
            }).get().$promise;
        }

        this.torrents = function() {
            var ret = $q.defer();
            var torrents = {
                labels: [],
                all:[],
                changed: [],
                deleted: []
            };
            var utorrentRes = _torrents().list(
                function() {
                    torrents.labels = (utorrentRes.label || []).map(labelTransform);
                    torrents.all = (utorrentRes.torrents || []).map(build);
                    torrents.changed = (utorrentRes.torrentp || []).map(build);
                    torrents.deleted = utorrentRes.torrentm;
                    ret.resolve(torrents);
                },
                function(err) {
                    ret.reject(err);
                }
            );

            return ret.promise;
        }

        function labelTransform(label){
            return label[0];
        }

        function _torrents() {
            return $resource(data.url + '.' + '?:action:data&token=:token&cid=:cid:opt&t=:t', {
                token: data.token,
                cid: data.cid,
                t: Date.now()
            }, {
                list: {
                    method: 'GET',
                    params: {
                        action: 'list=1'
                    },
                    transformResponse: function(response) {
                        return angular.fromJson(response.replace(/[\x00-\x1F]/g, ''));
                    },
                    interceptor: updateCidInterceptor,
                    isArray: false
                }
            });
        }

        function doAction(action, hashes) {
            return $resource(data.url + '.' + '?action=:action&token=:token&t=:t', {
                action: action,
                hash: hashes,
                token: data.token,
                cid: data.cid,
                t: Date.now()
            }).get().$promise;
        }

        this.start = function(hashes) {
            return doAction('start', hashes)
        }

        this.stop = function(hashes) {
            return doAction('stop', hashes)
        }

        this.pause = function(hashes) {
            return doAction('pause', hashes)
        }

        this.remove = function(hashes) {
            return doAction('remove', hashes)
        }

        this.removedata = function(hashes) {
            return doAction('removedata', hashes)
        }

        this.removetorrent = function(hashes) {
            return doAction('removetorrent', hashes)
        }

        this.removedatatorrent = function(hashes) {
            return doAction('removedatatorrent', hashes)
        }

        this.forcestart = function(hashes) {
            return doAction('forcestart', hashes)
        }

        this.recheck = function(hashes) {
            return doAction('recheck', hashes)
        }

        this.queueup = function(hashes) {
            return doAction('queueup', hashes)
        }

        this.queuedown = function(hashes) {
            return doAction('queuedown', hashes)
        }

        this.getprops = function(hashes) {
            return doAction('getprops', hashes)
        }

        this.getFileDownloadUrl = function(torrent,file) {
            if(torrent.streamId && this.settingsMap['webui.uconnect_enable'] && file.size === file.sizeDownloaded) {
                return '/proxy?sid=' + torrent.streamId + '&file=' + file.hash + '&disposition=ATTACHMENT&service=DOWNLOAD&qos=0';
            }
            return undefined;
        }

        this.setLabel = function(hashes, label) {
            var encodedQuery = '';
            var i;
            for (i = 0; i < hashes.length; i++) {
                encodedQuery += '&' + ['hash=' + hashes[i], 's=label', 'v=' + encodeURIComponent(label)].join('&');
            }
            return $http.get(data.url + '?token=' + data.token + '&action=setprops' + encodedQuery, {
                params: {
                    t: Date.now()
                }
            });
        }

        this.getSettings = function() {
            return this.actions()._getsettings().$promise;
        }

        this.setSetting = function(setting, value) {
            return this.setSettings([
                [setting, value]
            ]);
        }

        this.setSettings = function(settings) { // [ [setting1,value1], [setting2,value2] ]
            var encodedQuery = '';
            var i, val;
            for (i = 0; i < settings.length; i++) {
                val = settings[i][1];
                if (val === 'true') {
                    val = '1';
                } else if (val === 'false') {
                    val = '0';
                }
                encodedQuery += '&' + ['s=' + settings[i][0], 'v=' + encodeURIComponent(val)].join('&');
            }
            return $http.get(data.url + '?token=' + data.token + '&action=setsetting' + encodedQuery, {
                params: {
                    t: Date.now()
                }
            });
        }

        this.getDownloadDirectories = function() {
            return $resource(data.url + '.' + '?token=:token&action=list-dirs&t=:t', {
                token: data.token,
                t: Date.now()
            }, {
                get: {
                    isArray: true,
                    transformResponse: function(response) {
                        var responseData = angular.fromJson(response);
                        return responseData['download-dirs'];
                    }
                }
            }).get().$promise;
        }

        this.filePriority = function() {
            return $resource(data.url + '.' + '?token=:token&action=setprio&hash=:hash&t=:t&p=:priority', {
                token: data.token,
                t: Date.now()
            }, {
                set: {
                    method: 'GET'
                }
            });
        }

        this.getVersion = function() {
            var buildVersionStr = function() {
                var prefix = 'μTorrent';
                var preBuild = 'build';
                return [prefix, preBuild, data.build].join(' ');
            };

            if (data.build === -1) {
                return '';
            }
            return buildVersionStr();

        }

        this.actionHeader = [
            {
                label: 'Start',
                type: 'button',
                color: 'green',
                click: this.start,
                icon: 'play'
            },
            {
                label: 'Pause',
                type: 'button',
                color: 'yellow',
                click: this.pause,
                icon: 'pause'
            },
            {
                label: 'Stop',
                type: 'button',
                color: 'red',
                click: this.stop,
                icon: 'stop'
            },
            {
                label: 'Labels',
                click: this.setLabel,
                type: 'labels'
            }
        ]

        this.contextMenu = [
            {
                label: 'Recheck',
                click: this.recheck,
                icon: 'checkmark'
            },
            {
                label: 'Force Start',
                click: this.forcestart,
                icon: 'flag'
            },
            {
                label: 'Move Up Queue',
                click: this.queueup,
                icon: 'arrow up'
            },
            {
                label: 'Move Queue Down',
                click: this.queuedown,
                icon: 'arrow down'
            },
            {
                label: 'Remove',
                click: this.remove,
                icon: 'remove'
            },
            {
                label: 'Remove And',
                menu: [
                    {
                        label: 'Delete Torrent',
                        click: this.removetorrent,
                    },
                    {
                        label: 'Delete Data',
                        click: this.removedata,
                    },
                    {
                        label: 'Delete All',
                        click: this.removedatatorrent,
                    }
                ]
            }
        ];

    }]);
