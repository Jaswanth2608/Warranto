'use strict'

const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/authMiddleware')
const taskController = require('../controllers/actionPlannerController')
const { validate, schemas } = require('../middleware/validate')

router.use(protect)

router.post('/api/tasks', validate(schemas.createTask), taskController.createTask)

router.get('/api/tasks', taskController.getTasks)

router.get('/api/tasks/:id', taskController.getTask)

router.patch('/api/tasks/:id', validate(schemas.updateTask), taskController.updateTask)

router.post('/api/tasks/:id/complete', taskController.completeTask)

router.post('/api/tasks/:id/reopen', taskController.reopenTask)

router.delete('/api/tasks/:id', taskController.deleteTask)

router.get('/api/tasks/stats', taskController.getStats)

router.get('/api/reminders', taskController.getReminders)

router.post('/api/reminders/expire', taskController.expireOrDeleteReminders)

router.post('/api/reminders/compute', taskController.computeRemindersForUser)

module.exports = router
