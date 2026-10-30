import { listReviews } from '../../scripts/reviews.js'

export default defineEventHandler(() => listReviews().map(({ dir: _dir, url: _url, ...review }) => review))
