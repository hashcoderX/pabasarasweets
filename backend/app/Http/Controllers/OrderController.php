<?php

namespace App\Http\Controllers;

/**
 * Dedicated controller boundary for the dashboard order workflow.
 *
 * The inherited workflow implementation is kept temporarily to preserve the
 * established order behavior while orders and outlet POS are separated at the
 * API boundary. New order-specific changes should be made here as the workflow
 * is incrementally extracted from the POS controller.
 */
class OrderController extends OutletPosController
{
}
