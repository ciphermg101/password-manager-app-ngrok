--
-- PostgreSQL database dump
--

-- Dumped from database version 17.0
-- Dumped by pg_dump version 17.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_data; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA app_data;


ALTER SCHEMA app_data OWNER TO admin;

--
-- Name: update_timestamp(); Type: FUNCTION; Schema: app_data; Owner: admin
--

CREATE FUNCTION app_data.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION app_data.update_timestamp() OWNER TO admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: app_data; Owner: admin
--

CREATE TABLE app_data.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event character varying(255) NOT NULL,
    ip_address character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE app_data.audit_logs OWNER TO admin;

--
-- Name: credentials; Type: TABLE; Schema: app_data; Owner: admin
--

CREATE TABLE app_data.credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    site_url character varying(512) NOT NULL,
    username character varying(512),
    password text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(512),
    note text,
    name_iv text,
    url_iv text NOT NULL,
    username_iv text,
    password_iv text NOT NULL,
    note_iv text
);


ALTER TABLE app_data.credentials OWNER TO admin;

--
-- Name: password_breach; Type: TABLE; Schema: app_data; Owner: admin
--

CREATE TABLE app_data.password_breach (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    password_id uuid,
    breached_site character varying(255) NOT NULL,
    breach_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE app_data.password_breach OWNER TO admin;

--
-- Name: two_factor_auth; Type: TABLE; Schema: app_data; Owner: admin
--

CREATE TABLE app_data.two_factor_auth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    otp_secret text NOT NULL,
    enabled_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used_at timestamp with time zone
);


ALTER TABLE app_data.two_factor_auth OWNER TO admin;

--
-- Name: users; Type: TABLE; Schema: app_data; Owner: admin
--

CREATE TABLE app_data.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(512) NOT NULL,
    two_factor_enabled boolean DEFAULT false,
    google_oauth_id character varying(512),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login timestamp with time zone,
    username character varying(255),
    email_iv character varying(32) NOT NULL,
    username_iv character varying(32),
    google_oauth_id_iv character varying(32),
    reset_token_hash character varying(512),
    reset_token_expires timestamp with time zone,
    device_id character varying(100),
    is_verified boolean DEFAULT false,
    verification_token character varying(255),
    email_verification_expires timestamp with time zone
);


ALTER TABLE app_data.users OWNER TO admin;

--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: password_breach password_breach_pkey; Type: CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.password_breach
    ADD CONSTRAINT password_breach_pkey PRIMARY KEY (id);


--
-- Name: credentials passwords_pkey; Type: CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.credentials
    ADD CONSTRAINT passwords_pkey PRIMARY KEY (id);


--
-- Name: two_factor_auth two_factor_auth_pkey; Type: CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.two_factor_auth
    ADD CONSTRAINT two_factor_auth_pkey PRIMARY KEY (id);


--
-- Name: two_factor_auth two_factor_auth_user_id_key; Type: CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.two_factor_auth
    ADD CONSTRAINT two_factor_auth_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_user_id; Type: INDEX; Schema: app_data; Owner: admin
--

CREATE INDEX idx_audit_user_id ON app_data.audit_logs USING btree (user_id);


--
-- Name: idx_breach_user_id; Type: INDEX; Schema: app_data; Owner: admin
--

CREATE INDEX idx_breach_user_id ON app_data.password_breach USING btree (user_id);


--
-- Name: idx_password_user_id; Type: INDEX; Schema: app_data; Owner: admin
--

CREATE INDEX idx_password_user_id ON app_data.credentials USING btree (user_id);


--
-- Name: idx_user_email; Type: INDEX; Schema: app_data; Owner: admin
--

CREATE INDEX idx_user_email ON app_data.users USING btree (email);


--
-- Name: credentials update_passwords_modtime; Type: TRIGGER; Schema: app_data; Owner: admin
--

CREATE TRIGGER update_passwords_modtime BEFORE UPDATE ON app_data.credentials FOR EACH ROW EXECUTE FUNCTION app_data.update_timestamp();


--
-- Name: users update_users_modtime; Type: TRIGGER; Schema: app_data; Owner: admin
--

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON app_data.users FOR EACH ROW EXECUTE FUNCTION app_data.update_timestamp();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_data.users(id) ON DELETE CASCADE;


--
-- Name: credentials fk_user_id; Type: FK CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.credentials
    ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES app_data.users(id);


--
-- Name: password_breach password_breach_password_id_fkey; Type: FK CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.password_breach
    ADD CONSTRAINT password_breach_password_id_fkey FOREIGN KEY (password_id) REFERENCES app_data.credentials(id) ON DELETE CASCADE;


--
-- Name: password_breach password_breach_user_id_fkey; Type: FK CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.password_breach
    ADD CONSTRAINT password_breach_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_data.users(id) ON DELETE CASCADE;


--
-- Name: credentials passwords_user_id_fkey; Type: FK CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.credentials
    ADD CONSTRAINT passwords_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_data.users(id) ON DELETE CASCADE;


--
-- Name: two_factor_auth two_factor_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: app_data; Owner: admin
--

ALTER TABLE ONLY app_data.two_factor_auth
    ADD CONSTRAINT two_factor_auth_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_data.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

