from supabase_client import supabase

try:
    buckets = supabase.storage.list_buckets()

    print("Storage access: SUCCESS")
    print("Available buckets:")

    for bucket in buckets:
        print("-", bucket.name)

except Exception as error:
    print("Storage access failed.")
    print("Error:", error)