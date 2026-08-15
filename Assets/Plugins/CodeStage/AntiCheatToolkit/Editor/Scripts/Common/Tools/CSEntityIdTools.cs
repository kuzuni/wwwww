#region copyright
// -------------------------------------------------------
// Copyright (C) Dmitry Yuhanov [https://codestage.net]
// -------------------------------------------------------
#endregion

namespace CodeStage.EditorCommon.Tools
{
	using System;
	using UnityEditor;
	using UnityEngine;
	using Object = UnityEngine.Object;

	/// <summary>
	/// Cross-version compatibility layer for Unity 6.4+ EntityId migration.
	/// int↔EntityId casts are suppressed here as they are the only conversion path
	/// until Unity provides a non-deprecated alternative or removes int-based IDs entirely.
	///
	/// NOTE: GetObjectReferenceId/SetObjectReferenceId use UNITY_6000_4_OR_NEWER because
	/// objectReferenceEntityIdValue was introduced in 6000.4, while the other methods use
	/// UNITY_6000_3_OR_NEWER because GetEntityId() and related APIs arrived in 6000.3.
	/// The underlying int values are identical across both paths — EntityId is a type-safe
	/// wrapper around the same integer, so comparisons across these methods remain valid.
	/// </summary>
	internal static class CSEntityIdTools
	{
		public static int GetObjectReferenceId(SerializedProperty property)
		{
#if UNITY_6000_4_OR_NEWER
#pragma warning disable CS0618
			return (int)property.objectReferenceEntityIdValue;
#pragma warning restore CS0618
#else
#pragma warning disable CS0618
			return property.objectReferenceInstanceIDValue;
#pragma warning restore CS0618
#endif
		}

		public static void SetObjectReferenceId(SerializedProperty property, int id)
		{
#if UNITY_6000_4_OR_NEWER
#pragma warning disable CS0618
			property.objectReferenceEntityIdValue = (EntityId)id;
#pragma warning restore CS0618
#else
#pragma warning disable CS0618
			property.objectReferenceInstanceIDValue = id;
#pragma warning restore CS0618
#endif
		}

		public static int GetId(Object obj)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			return (int)obj.GetEntityId();
#pragma warning restore CS0618
#else
			return obj.GetInstanceID();
#endif
		}

		public static Object IdToObject(int id)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			return EditorUtility.EntityIdToObject((EntityId)id);
#pragma warning restore CS0618
#else
			return EditorUtility.InstanceIDToObject(id);
#endif
		}

		public static void PingObject(int id)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			EditorGUIUtility.PingObject((EntityId)id);
#pragma warning restore CS0618
#else
			EditorGUIUtility.PingObject(id);
#endif
		}

		public static string GetAssetPath(int id)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			return AssetDatabase.GetAssetPath((EntityId)id);
#pragma warning restore CS0618
#else
			return AssetDatabase.GetAssetPath(id);
#endif
		}

		public static bool Contains(int id)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			return AssetDatabase.Contains((EntityId)id);
#pragma warning restore CS0618
#else
			return AssetDatabase.Contains(id);
#endif
		}

		public static bool IsSubAsset(int id)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			return AssetDatabase.IsSubAsset((EntityId)id);
#pragma warning restore CS0618
#else
			return AssetDatabase.IsSubAsset(id);
#endif
		}

		public static bool IsMainAsset(int id)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			return AssetDatabase.IsMainAsset((EntityId)id);
#pragma warning restore CS0618
#else
			return AssetDatabase.IsMainAsset(id);
#endif
		}

		public static int[] GetSelectionIds()
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			return Array.ConvertAll(Selection.entityIds, id => (int)id);
#pragma warning restore CS0618
#else
			return Selection.instanceIDs;
#endif
		}

		public static void SetSelectionIds(int[] ids)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			Selection.entityIds = Array.ConvertAll(ids, id => (EntityId)id);
#pragma warning restore CS0618
#else
			Selection.instanceIDs = ids;
#endif
		}

		public static void SetActiveId(int id)
		{
#if UNITY_6000_3_OR_NEWER
#pragma warning disable CS0618
			Selection.activeEntityId = (EntityId)id;
#pragma warning restore CS0618
#else
			Selection.activeInstanceID = id;
#endif
		}
	}
}
