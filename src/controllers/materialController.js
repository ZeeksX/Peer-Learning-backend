import fs from 'fs';
import path from 'path';
import Material from '../models/Material.js';
import Session from '../models/Session.js';
import { sendError, sendSuccess } from '../middleware/responseHandler.js';

const normalizePath = (value) => value.replace(/\\/g, '/');

export const uploadMaterialFile = async (req, res) => {
  try { 
    if (!req.file) {
      return sendError(res, 'Please upload a file', 'MISSING_FILE', 400);
    }

    const { title, description = '', sessionId } = req.body;

    if (sessionId) {
      const session = await Session.findOne({ _id: sessionId, tutorId: req.tutor._id }).select('_id');
      if (!session) {
        fs.unlink(req.file.path, () => {});
        return sendError(res, 'Session not found or access denied', 'SESSION_NOT_FOUND', 404);
      }
    }

    const relativeFilePath = normalizePath(`uploads/materials/${req.file.filename}`);
    const fileUrl = `${req.protocol}://${req.get('host')}/${relativeFilePath}`;

    const material = await Material.create({
      tutorId: req.tutor._id,
      sessionId: sessionId || undefined,
      title: title?.trim() || req.file.originalname,
      description,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      filePath: relativeFilePath,
      fileUrl,
      uploadedBy: req.user._id
    });

    return sendSuccess(res, material, 201);
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return sendError(res, error.message, 'UPLOAD_MATERIAL_FAILED', 500);
  }
};

export const getTutorMaterials = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { tutorId: req.tutor._id };
    if (req.query.sessionId) query.sessionId = req.query.sessionId;

    const [materials, total] = await Promise.all([
      Material.find(query)
        .populate('sessionId', 'title subject startTime')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Material.countDocuments(query)
    ]);

    return sendSuccess(res, {
      materials,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_MATERIALS_FAILED', 500);
  }
};

export const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findOne({ _id: req.params.id, tutorId: req.tutor._id });
    if (!material) {
      return sendError(res, 'Material not found', 'MATERIAL_NOT_FOUND', 404);
    }

    await Material.deleteOne({ _id: material._id });

    if (material.filePath) {
      fs.unlink(path.resolve(material.filePath), () => {});
    }

    return sendSuccess(res, { id: material._id, deleted: true });
  } catch (error) {
    return sendError(res, error.message, 'DELETE_MATERIAL_FAILED', 500);
  }
};
