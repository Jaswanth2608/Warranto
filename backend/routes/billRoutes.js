/**
 * Bill routes — full upload lifecycle, scoped to the authenticated user.
 *
 *   GET    /api/bills        → { success, count, bills: [...] }
 *   POST   /api/bills        → 201 attach a bill (multipart: file + productId)
 *   PATCH  /api/bills/:id    → replace the bill (multipart: file)
 *   DELETE /api/bills/:id    → remove the bill from the product
 *   GET    /api/bills/:id/file → authenticated read of the stored file
 *                                (:id is the product id, or the bill id
 *                                 returned by GET /api/bills)
 *
 * A bill always belongs to a product owned by the authenticated user —
 * the controller re-verifies ownership on every operation.
 */

const { Router } = require('express')
const { param } = require('express-validator')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const { uploadBillFile } = require('../middleware/uploadBill')
const billController = require('../controllers/billController')

const router = Router()

const idRule = param('id').isMongoId().withMessage('Invalid product id.')

router.get('/', protect, requireDb, billController.listBills)

router.post('/', protect, requireDb, uploadBillFile, billController.uploadBill)

router.patch(
  '/:id',
  [idRule],
  validate,
  protect,
  requireDb,
  uploadBillFile,
  billController.replaceBill,
)

router.delete('/:id', [idRule], validate, protect, requireDb, billController.removeBill)

router.get('/:id/file', [idRule], validate, protect, requireDb, billController.getBillFile)

module.exports = router
