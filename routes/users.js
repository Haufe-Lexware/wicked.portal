'use strict';

var express = require('express');
var { debug, info, warn, error } = require('portal-env').Logger('portal:users');
var router = express.Router();
var async = require('async');
var utils = require('./utils');

router.get('/me', function (req, res, next) {
    debug("get('/me')");
    var loggedInUserId = utils.getLoggedInUserId(req);
    var userId = loggedInUserId;
    return getUser(loggedInUserId, userId, req, res, next);
});

router.get('/:userId', function (req, res, next) {
    debug("get('/:userId')");
    var loggedInUserId = utils.getLoggedInUserId(req);
    var userId = req.params.userId;
    return getUser(loggedInUserId, userId, req, res, next);
});

function getUser(loggedInUserId, userId, req, res, next) {
    debug("getUser(), loggedInUserId: " + loggedInUserId + ", userId: " + userId);
    if (!loggedInUserId) {
        var err = new Error('You cannot view user profiles when not logged in.');
        err.status = 403;
        return next(err);
    }

    async.parallel({
        getUser: function (callback) {
            utils.getFromAsync(req, res, '/users/' + userId, 200, callback);
        },
        getGroups: function (callback) {
            utils.getFromAsync(req, res, '/groups', 200, callback);
        }
    }, function (err, results) {
        if (err)
            return next(err);

        var userInfo = results.getUser;
        var groups = results.getGroups.groups;
        for (var i = 0; i < userInfo.groups.length; ++i) {
            for (var j = 0; j < groups.length; ++j) {
                if (groups[j].id == userInfo.groups[i])
                    groups[j].isMember = true;
            }
        }

        if (!utils.acceptJson(req)) {
            res.render('user',
                {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    title: userInfo.name,
                    userInfo: userInfo,
                    groups: groups
                });
        } else {
            res.json({
                title: userInfo.name,
                userInfo: userInfo,
                groups: groups
            });
        }
    });
}

router.post('/:userId', function (req, res, next) {
    debug("post('/:userId')");
    var loggedInUserId = utils.getLoggedInUserId(req);
    if (!loggedInUserId) {
        var err = new Error('You cannot update a user profile when not logged in.');
        err.status = 403;
        return next(err);
    }

    var b = req.body;

    debug(b);
    var userId = req.params.userId;

    if ("deletePassword" == b.__action) {
        utils.delete(req, '/users/' + userId + '/password', function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (204 != apiResponse.statusCode)
                return utils.handleError(res, apiResponse, apiBody, next);
            // Woo hoo
            if (!utils.acceptJson(req))
                return res.redirect('/users/' + userId);
            else
                return res.status(204).json({});
        });
        return;
    }

    // We need the groups, perhaps
    utils.getFromAsync(req, res, '/groups', 200, function (err, groupsResponse) {
        var apiGroups = groupsResponse.groups;

        var userPatch = {};
        if (b.firstname)
            userPatch.firstName = b.firstname;
        if (b.lastname)
            userPatch.lastName = b.lastname;
        if (b.password)
            userPatch.password = b.password;
        // Check for groups only if user is admin
        if (b.__updategroups) {
            if (req.user.admin) {
                // Do da groups
                var newGroups = [];
                for (var i = 0; i < apiGroups.length; ++i) {
                    var groupId = apiGroups[i].id;
                    if (b[groupId] == groupId)
                        newGroups.push(groupId);
                }
                userPatch.groups = newGroups;
            }
        }

        utils.patch(req, '/users/' + userId, userPatch, function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (200 != apiResponse.statusCode)
                return utils.handleError(res, apiResponse, apiBody, next);
            // Yay!
            if (!utils.acceptJson(req))
                if (userId === loggedInUserId)
                    res.redirect('/users/me');
                else
                    res.redirect('/users/' + userId);
            else
                res.json(utils.getJson(apiBody));
        });
    });
});

router.post('/:userId/delete', function (req, res, next) {
    var loggedInUserId = utils.getLoggedInUserId(req);
    if (!loggedInUserId) {
        var err = new Error('You cannot delete a user profile when not logged in.');
        err.status = 403;
        return next(err);
    }

    var userToDelete = req.params.userId;
    var selfDeletion = (userToDelete.toLowerCase() == loggedInUserId.toLowerCase());

    utils.delete(req, '/users/' + userToDelete, function (err, apiResponse, apiBody) {
        if (err)
            return next(err);
        if (204 != apiResponse.statusCode)
            return utils.handleError(res, apiResponse, apiBody, next);
        // Yay!

        if (!utils.acceptJson(req)) {
            if (selfDeletion)
                return res.redirect('/login/logout');
            return res.redirect('/admin/users');
        } else {
            res.status(204).json({});
        }
    });
});

module.exports = router;